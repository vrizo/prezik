import { chromium } from "playwright";
import type { Page } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Scene, SceneAction, Storyboard } from "@prezik/shared";
import { VOICE_MAP } from "@prezik/shared";
import type { Emitter } from "./callbacks.js";
import { attachBrowserTelemetry } from "./diag.js";
import type { Logger } from "./log.js";
import type { Credentials, RecordOptions } from "./types.js";
import { synthesizeSpeech } from "./tts.js";
import { assembleAndMux, probeDurationMs, type AudioPlacement } from "./ffmpeg.js";
import { buildConcat, startScreencast } from "./screencast.js";
import { buildVtt, type VttSegment } from "./vtt.js";
import { remainingWaitMs, SILENT_SEGMENT_MS } from "./timing.js";
import {
  cursorInitScript,
  esbuildHelperInitScript,
  highlightSelector,
  moveCursorToSelector,
  titleCardHtml,
  zoomOut,
  zoomToSelector,
} from "./browser.js";
import { randomPassword, timestampId } from "./util.js";

export interface RecordJob {
  runId: string;
  storyboard: Storyboard;
  options: RecordOptions;
  credentials?: Credentials;
  outDir: string;
  tts: boolean; // false => silent render, fixed seconds per segment
  emit: Emitter;
  log: Logger;
}

export interface RecordResult {
  mp4Path: string;
  durationSec: number;
  captionsVtt?: string;
}

interface Segment {
  kind: "intro" | "scene" | "outro";
  id: string;
  narration: string;
  audioPath: string | null;
  audioMs: number;
  startEpochMs: number; // wall clock at segment start; made relative to the
  // first captured frame's timestamp at assembly time
}

interface ResolvedCreds {
  email?: string;
  password?: string;
}

// Decide the credential values the storyboard's {{email}}/{{password}} resolve
// to. Only invents signup values when the storyboard actually uses them, and
// then reports them via a credentials callback.
async function resolveCreds(job: RecordJob): Promise<ResolvedCreds> {
  const blob = JSON.stringify(job.storyboard);
  const usesEmail = blob.includes("{{email}}");
  const usesPassword = blob.includes("{{password}}");
  if (!usesEmail && !usesPassword) return {};

  const c = job.credentials;
  if (!c || c.mode === "none") {
    throw new Error("storyboard uses {{email}}/{{password}} but no login/signup credentials were provided");
  }
  if (c.mode === "login") return { email: c.email, password: c.password };

  const email = `${timestampId()}@${c.emailDomain}`;
  const password = randomPassword(16);
  await job.emit.emit({ kind: "credentials", email, password });
  job.log.info(`signup credentials invented for ${email}`);
  return { email, password };
}

function fillValue(raw: string, creds: ResolvedCreds): string {
  if (raw.includes("{{email}}")) {
    if (!creds.email) throw new Error("fill uses {{email}} but no email credential is available");
    raw = raw.replaceAll("{{email}}", creds.email);
  }
  if (raw.includes("{{password}}")) {
    if (!creds.password) throw new Error("fill uses {{password}} but no password credential is available");
    raw = raw.replaceAll("{{password}}", creds.password);
  }
  return raw;
}

// A logged-in session can make the target site redirect a docs/marketing URL
// away mid-navigation. Chrome reports the cancelled original request as
// net::ERR_ABORTED even though the browser has committed to the redirect target.
// So: navigate with waitUntil "commit" (resolves the moment the navigation
// commits, before a client-side redirect can abort a longer domcontentloaded
// wait), settle on a load state, then check where we actually landed. Staying on
// the target site — the redirect target included — is success; about:blank, a
// chrome-error:// page, or a different host is a real failure that fails the
// scene loudly. One navigation and an honest check of the outcome, never a retry.
function parseUrlOrNull(u: string): URL | null {
  try {
    return new URL(u);
  } catch {
    return null;
  }
}

function canonicalUrl(u: URL): string {
  return u.origin + u.pathname.replace(/\/+$/, "");
}

async function gotoForScene(page: Page, url: string, emit: Emitter): Promise<void> {
  const target = new URL(url);
  try {
    await page.goto(url, { waitUntil: "commit", timeout: 30000 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Only the redirect-race abort is tolerated; every other goto failure
    // (DNS, connection refused, timeout, ...) is real and must propagate.
    if (!message.includes("ERR_ABORTED")) throw e;
  }
  await page.waitForLoadState("domcontentloaded", { timeout: 30000 });
  const landed = page.url();
  const landedUrl = parseUrlOrNull(landed);
  if (landed === "about:blank" || landed.startsWith("chrome-error://") || !landedUrl || landedUrl.host !== target.host) {
    throw new Error(`goto ${url} did not land on ${target.host}: now at ${landed}`);
  }
  if (canonicalUrl(landedUrl) !== canonicalUrl(target)) {
    await emit.emit({
      kind: "event",
      event: { agent: "presenter", level: "info", message: `landed on ${landed} after redirect`, url: landed },
    });
  }
}

async function runAction(page: Page, action: SceneAction, creds: ResolvedCreds, emit: Emitter, log: Logger): Promise<void> {
  switch (action.type) {
    case "goto":
      await gotoForScene(page, action.url, emit);
      await page.waitForTimeout(600);
      return;
    case "click":
      await moveCursorToSelector(page, action.selector);
      await page.locator(action.selector).first().click({ timeout: 8000 });
      return;
    case "hover":
      await moveCursorToSelector(page, action.selector);
      await page.locator(action.selector).first().hover({ timeout: 8000 });
      return;
    case "fill":
      await moveCursorToSelector(page, action.selector);
      await page.locator(action.selector).first().fill(fillValue(action.value, creds), { timeout: 8000 });
      return;
    case "press":
      await page.keyboard.press(action.key);
      return;
    case "scrollTo":
      await page.locator(action.selector).first().scrollIntoViewIfNeeded({ timeout: 8000 });
      await page.waitForTimeout(500);
      return;
    case "highlight":
      await highlightSelector(page, action.selector);
      return;
    case "zoom":
      await zoomToSelector(page, action.selector, action.paddingPx);
      return;
    case "zoomOut":
      await zoomOut(page, log);
      return;
    case "wait":
      await page.waitForTimeout(action.ms);
      return;
  }
}

// Generate TTS for intro, every scene, and outro up front so scene wall time can
// be matched to real narration length. Silent mode skips synthesis.
async function synthesizeAll(job: RecordJob): Promise<Map<string, { path: string | null; ms: number }>> {
  const voice = VOICE_MAP[job.options.voice];
  const items: { id: string; text: string }[] = [
    { id: "intro", text: job.storyboard.intro.narration },
    ...job.storyboard.scenes.map((s) => ({ id: s.id, text: s.narration })),
    { id: "outro", text: job.storyboard.outro.narration },
  ];
  const out = new Map<string, { path: string | null; ms: number }>();
  if (!job.tts) {
    for (const it of items) out.set(it.id, { path: null, ms: SILENT_SEGMENT_MS });
    return out;
  }
  await Promise.all(
    items.map(async (it) => {
      const path = join(job.outDir, `audio-${it.id}.mp3`);
      const ms = await synthesizeSpeech(it.text, voice, path);
      out.set(it.id, { path, ms });
      job.log.info(`tts ${it.id}: ${ms}ms`);
    }),
  );
  return out;
}

export async function runRecording(job: RecordJob): Promise<RecordResult> {
  mkdirSync(job.outDir, { recursive: true });
  const framesDir = join(job.outDir, "frames");
  mkdirSync(framesDir, { recursive: true });

  const creds = await resolveCreds(job);
  const audio = await synthesizeAll(job);
  job.log.info(`recording ${job.storyboard.scenes.length} scene(s), tts=${job.tts}`);

  // --disable-dev-shm-usage: Playwright passes it by default today; pinned here
  // so the container never depends on that default (64MB /dev/shm in prod).
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.addInitScript(esbuildHelperInitScript());
  await context.addInitScript(cursorInitScript());
  const page = await context.newPage();
  const telemetry = attachBrowserTelemetry(page, job.log);

  const segments: Segment[] = [];

  const runSegment = async (kind: Segment["kind"], id: string, narration: string, body: () => Promise<void>) => {
    const startEpochMs = Date.now();
    const a = audio.get(id)!;
    await body();
    const wait = remainingWaitMs(a.ms, Date.now() - startEpochMs);
    if (wait > 0) await page.waitForTimeout(wait);
    segments.push({ kind, id, narration, audioPath: a.path, audioMs: a.ms, startEpochMs });
  };

  let frames;
  try {
    const screencast = await startScreencast(page, framesDir, job.log);
    try {
      // Intro title card.
      await runSegment("intro", "intro", job.storyboard.intro.narration, async () => {
        await page.setContent(titleCardHtml(job.storyboard.productName, job.storyboard.tagline), { waitUntil: "load" });
      });

      // Scenes.
      for (const scene of job.storyboard.scenes) {
        await job.emit.emit({
          kind: "event",
          event: { agent: "presenter", level: "info", message: `scene ${scene.id}: ${scene.title}`, sceneId: scene.id },
        });
        await runSegment("scene", scene.id, scene.narration, async () => {
          await runScene(page, scene, creds, job.options.zoom, job.emit, job.log);
        });
        await job.emit.emit({ kind: "sceneDone", sceneId: scene.id });
        job.log.info(`scene done: ${scene.id}`);
      }

      // Outro title card.
      await runSegment("outro", "outro", job.storyboard.outro.narration, async () => {
        await page.setContent(titleCardHtml(job.storyboard.productName, job.storyboard.tagline), { waitUntil: "load" });
      });
    } finally {
      frames = await screencast.stop();
    }
  } finally {
    telemetry.disarm(); // the close below is intentional, not a death
    await context.close();
    await browser.close();
  }

  // The video's t=0 is the first captured frame; express narration offsets
  // relative to it.
  const videoStartMs = frames.timestampsMs[0];
  const concatPath = join(framesDir, "frames.ffconcat");
  writeFileSync(concatPath, buildConcat(frames.files, frames.timestampsMs, frames.endMs));

  const offsetOf = (s: Segment) => Math.max(0, Math.round(s.startEpochMs - videoStartMs));
  const placements: AudioPlacement[] = segments
    .filter((s): s is Segment & { audioPath: string } => s.audioPath !== null)
    .map((s) => ({ path: s.audioPath, offsetMs: offsetOf(s) }));

  const mp4Path = join(job.outDir, `${job.runId}.mp4`);
  await assembleAndMux(concatPath, placements, mp4Path, job.log);
  const durationSec = Math.round((await probeDurationMs(mp4Path)) / 1000);

  // Frames and narration clips are only inputs to the finished mp4. Delete them
  // so a long-lived container instance does not accumulate ~100MB per run.
  rmSync(framesDir, { recursive: true, force: true });
  for (const s of segments) if (s.audioPath) rmSync(s.audioPath, { force: true });
  job.log.info(`cleaned ${frames.files.length} frame files + ${placements.length} audio clip(s)`);

  let captionsVtt: string | undefined;
  if (job.options.captions) {
    const vttSegments: VttSegment[] = segments.map((s) => ({ startMs: offsetOf(s), audioMs: s.audioMs, narration: s.narration }));
    captionsVtt = buildVtt(vttSegments);
  }

  return { mp4Path, durationSec, captionsVtt };
}

async function runScene(page: Page, scene: Scene, creds: ResolvedCreds, zoomEnabled: boolean, emit: Emitter, log: Logger): Promise<void> {
  for (const action of scene.actions) {
    // Honor the zoom option: when off, skip zoom/zoomOut actions entirely.
    if (!zoomEnabled && (action.type === "zoom" || action.type === "zoomOut")) continue;
    try {
      await runAction(page, action, creds, emit, log);
    } catch (e) {
      const sel = "selector" in action ? action.selector : "url" in action ? action.url : action.type;
      log.error(`action ${action.type} failed [${sel}] in scene ${scene.id}`, String(e));
      throw e; // fail loudly; the job wrapper reports recorderFailed
    }
  }
}
