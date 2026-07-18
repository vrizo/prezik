import { chromium } from "playwright";
import type { Page } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Scene, SceneAction, Storyboard } from "@prezik/shared";
import { VOICE_MAP } from "@prezik/shared";
import { dismissConsentBanner, performAuth } from "./auth.js";
import type { Emitter } from "./callbacks.js";
import { attachBrowserTelemetry } from "./diag.js";
import type { Logger } from "./log.js";
import { outputSizeFor, viewportFor, type Credentials, type RecordOptions } from "./types.js";
import { synthesizeSpeech } from "./tts.js";
import { assembleAndMux, probeDurationMs, type AudioPlacement } from "./ffmpeg.js";
import { buildConcat, compressSilence, startScreencast, MAX_SILENCE_GAP_MS } from "./screencast.js";
import { buildSrt, buildVtt, type VttSegment } from "./vtt.js";
import { beatStartOffsets, remainingWaitMs, SILENT_SEGMENT_MS } from "./timing.js";
import {
  cursorInitScript,
  endCardHtml,
  esbuildHelperInitScript,
  highlightSelector,
  moveCursorToSelector,
  titleCardHtml,
  waitForHighlightSettled,
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

// Fixed hold for the closing logo card, in ms.
const END_CARD_MS = 2000;
// Product link shown beneath the logo on the closing card.
const END_CARD_LINK = "present.vrizo.net";

interface Segment {
  kind: "intro" | "scene" | "outro" | "endcard";
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
  // Selectors were harvested from the fully rendered page, but after a scene
  // goto an SPA may still be fetching data — so every selector-based action
  // first waits for its element to be visible. Locator actions (click/fill/
  // hover) auto-wait anyway; the evaluate-based ones (cursor move, highlight,
  // zoom) do not, and would otherwise fail on a page that is still rendering.
  const awaitSelector = async (selector: string) => {
    await page.locator(selector).first().waitFor({ state: "visible", timeout: 10000 });
  };
  switch (action.type) {
    case "goto":
      // Never cut away while a highlight is still animating on the old page.
      await waitForHighlightSettled(page);
      await gotoForScene(page, action.url, emit);
      await page.waitForTimeout(600);
      return;
    case "click":
      await awaitSelector(action.selector);
      await moveCursorToSelector(page, action.selector);
      await page.locator(action.selector).first().click({ timeout: 8000 });
      return;
    case "hover":
      await awaitSelector(action.selector);
      await moveCursorToSelector(page, action.selector);
      await page.locator(action.selector).first().hover({ timeout: 8000 });
      return;
    case "fill":
      await awaitSelector(action.selector);
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
      await awaitSelector(action.selector);
      // Glide the cursor along with the spotlight so the pointer tracks what
      // the narrator is describing instead of sitting parked at the edge.
      await moveCursorToSelector(page, action.selector);
      await highlightSelector(page, action.selector);
      return;
    case "zoom":
      await awaitSelector(action.selector);
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
  // CSS layout at deviceScaleFactor 1.5: pages lay out at the format's CSS
  // viewport (1280x720 horizontal, 720x1280 vertical) while Chrome renders at
  // 1.5x device pixels, so screencast frames stay native full HD.
  // --force-device-scale-factor is required on top of the context option: the
  // CDP screencast emits frames in DIPs unless the headless compositor itself
  // runs at 1.5 — verified empirically against both knobs.
  const viewport = viewportFor(job.options.format);
  const outputSize = outputSizeFor(job.options.format);
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--force-device-scale-factor=1.5"],
  });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1.5 });
  await context.addInitScript(esbuildHelperInitScript());
  await context.addInitScript(cursorInitScript());
  const page = await context.newPage();
  const telemetry = attachBrowserTelemetry(page, job.log);

  // Off-camera pre-roll, before the screencast starts: sign in (login never
  // appears in the video — the storyboard no longer contains login scenes) and
  // dismiss any cookie banner so it neither shows in frames nor blocks clicks.
  // Strict auth: a failed sign-in fails the run loudly (the record job wrapper
  // reports recorderFailed).
  await gotoForScene(page, job.storyboard.targetUrl, job.emit);
  await dismissConsentBanner(page, job.log);
  if (job.credentials && job.credentials.mode !== "none") {
    await performAuth(page, job.credentials, job.emit, job.log, { strict: true, agent: "presenter" });
    await dismissConsentBanner(page, job.log); // the app may show its own banner after login
    await job.emit.emit({
      kind: "event",
      event: { agent: "presenter", level: "info", message: "signed in before recording", url: page.url() },
    });
  }

  const segments: Segment[] = [];

  // preBody runs BEFORE the narration clock (startEpochMs) starts — used for a
  // scene's leading goto so its loading state lands in the silent gap before this
  // segment's narration clip (which the assembly-time silence compression cuts),
  // not mid-narration. body receives startEpochMs so it can schedule visual beats
  // relative to the narration start.
  const runSegment = async (
    kind: Segment["kind"],
    id: string,
    narration: string,
    body: (startEpochMs: number) => Promise<void>,
    preBody?: () => Promise<void>,
  ) => {
    if (preBody) await preBody();
    const startEpochMs = Date.now();
    const a = audio.get(id)!;
    await body(startEpochMs);
    const wait = remainingWaitMs(a.ms, Date.now() - startEpochMs);
    if (wait > 0) await page.waitForTimeout(wait);
    segments.push({ kind, id, narration, audioPath: a.path, audioMs: a.ms, startEpochMs });
  };

  let frames;
  try {
    const screencast = await startScreencast(page, framesDir, job.log, outputSize);
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
        const a = audio.get(scene.id)!;
        // A scene whose FIRST action is a goto navigates off-clock: run the goto
        // and wait for the page to settle before the narration starts, so the
        // load lands in the silent gap (later compressed away), not on camera.
        const firstIsGoto = scene.actions.length > 0 && scene.actions[0].type === "goto";
        await runSegment(
          "scene",
          scene.id,
          scene.narration,
          (startEpochMs) => runScene(page, scene, creds, job.options.zoom, job.emit, job.log, startEpochMs, a.ms, firstIsGoto),
          firstIsGoto
            ? async () => {
                await runAction(page, scene.actions[0], creds, job.emit, job.log);
                // Bounded, logged readiness wait — not a silent fallback.
                await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {
                  job.log.info("networkidle not reached, continuing");
                });
              }
            : undefined,
        );
        await job.emit.emit({ kind: "sceneDone", sceneId: scene.id });
        job.log.info(`scene done: ${scene.id}`);
      }

      // Outro title card. The pre-body wait keeps the last scene's highlight
      // fade-out on camera instead of cutting to the card mid-animation.
      await runSegment(
        "outro",
        "outro",
        job.storyboard.outro.narration,
        async () => {
          await page.setContent(titleCardHtml(job.storyboard.productName, job.storyboard.tagline), { waitUntil: "load" });
        },
        () => waitForHighlightSettled(page),
      );

      // Closing logo card: the Prezik logo + product link on white, held a fixed
      // 2s. Silent (no narration/audio), so it runs outside runSegment. Pushed as
      // a segment with audioMs=END_CARD_MS purely so silence compression treats
      // its 2s as protected clip time and does not cut it down to MAX_SILENCE_GAP.
      const endCardStart = Date.now();
      await page.setContent(endCardHtml(END_CARD_LINK), { waitUntil: "load" });
      await page.waitForTimeout(END_CARD_MS);
      segments.push({
        kind: "endcard",
        id: "endcard",
        narration: "",
        audioPath: null,
        audioMs: END_CARD_MS,
        startEpochMs: endCardStart,
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
  const rawOffsetOf = (s: Segment) => Math.max(0, Math.round(s.startEpochMs - videoStartMs));

  // Cut long silent stretches (post-goto loading, dead air) down to a ceiling.
  // The audio inside clips is never modified — only silent video time between
  // clips is removed — so sync is preserved. Silent renders (tts=false) have no
  // narration clips and therefore no silent-gap definition, so they deliberately
  // keep real-time pacing and skip compression entirely.
  let framesFiles = frames.files;
  let framesTimestamps = frames.timestampsMs;
  let framesEndMs = frames.endMs;
  let clipOffsets: number[] | null = null;
  if (job.tts) {
    const rawClips = segments.map((s) => ({ offsetMs: rawOffsetOf(s), durationMs: s.audioMs }));
    const compressed = compressSilence(frames.files, frames.timestampsMs, frames.endMs, rawClips, MAX_SILENCE_GAP_MS);
    framesFiles = compressed.files;
    framesTimestamps = compressed.timestampsMs;
    framesEndMs = compressed.endMs;
    clipOffsets = compressed.clipOffsetsMs;
    job.log.info(`silence compression: ${frames.files.length} -> ${compressed.files.length} frames`);
  }

  // clipOffsets (when present) aligns 1:1 with segments; fall back to the raw
  // wall-clock offset for silent renders.
  const offsetOf = (s: Segment, i: number) => (clipOffsets ? clipOffsets[i] : rawOffsetOf(s));

  const concatPath = join(framesDir, "frames.ffconcat");
  writeFileSync(concatPath, buildConcat(framesFiles, framesTimestamps, framesEndMs));

  const placements: AudioPlacement[] = segments
    .map((s, i) => ({ s, i }))
    .filter((x): x is { s: Segment & { audioPath: string }; i: number } => x.s.audioPath !== null)
    .map(({ s, i }) => ({ path: s.audioPath, offsetMs: offsetOf(s, i) }));

  // Captions are burned into the video (SRT via ffmpeg's subtitles filter) and
  // also emitted as a sidecar WebVTT for the in-app <track> element.
  let captionsVtt: string | undefined;
  let srtPath: string | undefined;
  if (job.options.captions) {
    const vttSegments: VttSegment[] = segments.map((s, i) => ({ startMs: offsetOf(s, i), audioMs: s.audioMs, narration: s.narration }));
    captionsVtt = buildVtt(vttSegments);
    srtPath = join(framesDir, "captions.srt");
    writeFileSync(srtPath, buildSrt(vttSegments));
  }

  const mp4Path = join(job.outDir, `${job.runId}.mp4`);
  await assembleAndMux(concatPath, placements, mp4Path, job.log, srtPath, outputSize);
  const durationSec = Math.round((await probeDurationMs(mp4Path)) / 1000);

  // Frames and narration clips are only inputs to the finished mp4. Delete them
  // so a long-lived container instance does not accumulate ~100MB per run.
  rmSync(framesDir, { recursive: true, force: true });
  for (const s of segments) if (s.audioPath) rmSync(s.audioPath, { force: true });
  job.log.info(`cleaned ${frames.files.length} frame files + ${placements.length} audio clip(s)`);

  return { mp4Path, durationSec, captionsVtt };
}

// Visual "beat" actions whose timing is spread across the narration.
const ANCHOR_TYPES = new Set<SceneAction["type"]>(["highlight", "zoom", "zoomOut"]);

async function runScene(
  page: Page,
  scene: Scene,
  creds: ResolvedCreds,
  zoomEnabled: boolean,
  emit: Emitter,
  log: Logger,
  narrationStartMs: number,
  narrationMs: number,
  skipFirstAction: boolean, // the leading goto already ran off-clock in preBody
): Promise<void> {
  // Which actions actually run: the leading goto (when skipped) and, with zoom
  // off, zoom/zoomOut are excluded. Anchor beats among the runners are spread
  // evenly across the narration so highlights/zooms appear as the narrator
  // describes them instead of all firing up front and freezing the video.
  const willRun = (i: number, a: SceneAction) =>
    !(skipFirstAction && i === 0) && !(!zoomEnabled && (a.type === "zoom" || a.type === "zoomOut"));
  const anchorCount = scene.actions.filter((a, i) => willRun(i, a) && ANCHOR_TYPES.has(a.type)).length;
  const slots = beatStartOffsets(narrationMs, anchorCount);

  let anchorIndex = 0;
  for (let i = 0; i < scene.actions.length; i++) {
    const action = scene.actions[i];
    if (!willRun(i, action)) continue;
    if (ANCHOR_TYPES.has(action.type)) {
      // Wait until this beat's slot relative to the narration start, unless the
      // preceding actions already ran past it (never wait a negative amount).
      const target = narrationStartMs + slots[anchorIndex];
      anchorIndex++;
      const wait = target - Date.now();
      if (wait > 0) await page.waitForTimeout(wait);
    }
    try {
      await runAction(page, action, creds, emit, log);
    } catch (e) {
      const sel = "selector" in action ? action.selector : "url" in action ? action.url : action.type;
      // One broken action (e.g. a button the app keeps disabled) must not kill
      // the whole recording. The rest of THIS scene is skipped — later actions
      // may depend on the failed one — and the failure is reported as an error
      // event so it is visible in the run feed, then recording moves on to the
      // next scene. Navigation and auth failures outside runScene still fail
      // the run loudly.
      log.error(`action ${action.type} failed [${sel}] in scene ${scene.id}, skipping rest of scene`, String(e));
      await emit.emit({
        kind: "event",
        event: {
          agent: "presenter",
          level: "error",
          message: `scene ${scene.id}: ${action.type} on ${sel} failed (${firstLine(e)}) — remaining actions skipped, video continues`,
          sceneId: scene.id,
        },
      });
      // Do not leave a stale zoom behind for a following scene that has no goto.
      if (zoomEnabled) await zoomOut(page, log).catch(() => log.info("zoomOut after failed action did not apply"));
      return;
    }
  }
  // Let the last highlight finish its fade-out before the scene can end — the
  // narration tail usually covers this, but actions that ran long must not
  // leave a half-faded frame as the cut point.
  await waitForHighlightSettled(page);
}

// First line of a Playwright error — the full message includes a multi-line
// call log that would bloat the run feed.
function firstLine(e: unknown): string {
  return String(e instanceof Error ? e.message : e).split("\n")[0];
}
