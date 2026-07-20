// Local training pipeline: runs the ACTUAL product code from this working
// tree, end to end, with no UI and no Convex deployment. Scout and Director
// are the same modules the Convex actions call (app/convex/agents/*Core.ts),
// Mapper and Presenter are the same recorder code the container ships
// (recorder/src/map.ts, recorder/src/record.ts). The OpenAI requests are
// byte-for-byte what production makes; only the orchestration around them is
// local. See docs/training/loop.md.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LENGTH_TO_SCENES } from "@prezik/shared";
import type { RunEvent, RunOptions, SitePage } from "@prezik/shared";
import { runScout, SCOUT_MODEL, type TokenUsage } from "../app/convex/agents/scoutCore";
import { generateStoryboard, DIRECTOR_MODEL } from "../app/convex/agents/directorCore";
import { SCOUT_PROMPT_VERSION } from "../app/convex/prompts/scout";
import { DIRECTOR_PROMPT_VERSION } from "../app/convex/prompts/director";
import { runMap } from "../recorder/src/map.js";
import { runRecording, type SegmentTiming } from "../recorder/src/record.js";
import type { Emitter } from "../recorder/src/callbacks.js";
import { resolveBin } from "../recorder/src/ffmpeg.js";

// ---------------------------------------------------------------------------
// Cost model — rates from docs/agents/models.md (verified July 2026). Update
// both together. Tavily search and ffmpeg are not metered here.
// ---------------------------------------------------------------------------

const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "gpt-5.4-nano": { input: 0.2, output: 1.25 },
  "gpt-5.6-sol": { input: 5, output: 30 },
};
const TTS_USD_PER_MIN = 0.015; // gpt-4o-mini-tts, approximate

function modelUsd(model: string, usage: TokenUsage): number {
  const price = PRICE_PER_MTOK[model];
  if (!price) throw new Error(`no price on file for model "${model}" — update PRICE_PER_MTOK and docs/agents/models.md`);
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}

export interface CostReport {
  scout: { model: string; inputTokens: number; outputTokens: number; usd: number };
  director: { model: string; inputTokens: number; outputTokens: number; usd: number };
  ttsAudioSec: number;
  ttsUsd: number;
  totalUsd: number;
  note: string;
}

export interface PhaseTimings {
  scoutMs: number;
  mapMs: number;
  directorMs: number;
  recordMs: number;
  totalMs: number;
}

export interface LocalRunArtifacts {
  iterDir: string;
  storyboardPath?: string;
  eventsPath: string;
  metaPath: string;
  mapShotsDir: string;
  thinkingPath?: string;
  mp4Path?: string;
  vttPath?: string;
  framePaths: string[];
}

export type LocalRunResult =
  | {
      kind: "done";
      runId: string;
      brief: string;
      events: (RunEvent & { seq: number })[];
      durationSec: number;
      segments: SegmentTiming[];
      cost: CostReport;
      phases: PhaseTimings;
      promptVersions: { scout: number; director: number };
      artifacts: LocalRunArtifacts;
    }
  | { kind: "needs_credentials"; runId: string; reason: string; brief: string; artifacts: LocalRunArtifacts };

export interface LocalLogger {
  info(msg: string): void;
  error(msg: string): void;
}

// ---------------------------------------------------------------------------
// Local emitter: recorder callbacks land in memory + on disk instead of
// being POSTed to Convex. Map screenshots are saved as files, so the judge
// can look at exactly what the agents saw.
// ---------------------------------------------------------------------------

interface Collected {
  events: (RunEvent & { seq: number })[];
  pages: SitePage[];
  credentialsUsed?: { email: string; password: string };
}

function makeLocalEmitter(collected: Collected, mapShotsDir: string, log: LocalLogger): Emitter {
  let seq = 0;
  let shot = 0;
  return {
    async emit(cb) {
      if (cb.kind === "event") {
        collected.events.push({ ...cb.event, seq: ++seq });
        const line = `${cb.event.level === "error" ? "ERROR " : ""}[${cb.event.agent}] ${cb.event.message}${cb.event.url ? ` (${cb.event.url})` : ""}`;
        log.info(line);
      } else if (cb.kind === "page") {
        collected.pages.push(cb.page);
      } else if (cb.kind === "credentials") {
        collected.credentialsUsed = { email: cb.email, password: cb.password };
        log.info(`[mapper] signup credentials created: ${cb.email}`);
      } else if (cb.kind === "sceneDone") {
        log.info(`[presenter] scene done: ${cb.sceneId}`);
      } else if (cb.kind === "mapDone") {
        log.info(`[mapper] map done: ${cb.pageCount} pages`);
      } else {
        log.info(`[recorder] callback ${cb.kind}`);
      }
    },
    async uploadScreenshot(jpeg) {
      const id = `shot-${String(++shot).padStart(3, "0")}.jpg`;
      writeFileSync(join(mapShotsDir, id), jpeg);
      return id;
    },
  };
}

// ---------------------------------------------------------------------------
// Frame sampling near actions. Visual beats (highlight/zoom) are spread
// across each scene's narration window (recorder/src/timing.ts), so frames
// at ~35% and ~85% of the narration catch the beats mid-flight, unlike even
// whole-video sampling which mostly lands between the interesting moments.
// ---------------------------------------------------------------------------

const FFMPEG = resolveBin("ffmpeg");
const MAX_FRAMES = 20;

export function frameTimesForSegments(segments: SegmentTiming[], durationSec: number): { label: string; tSec: number }[] {
  const times: { label: string; tSec: number }[] = [];
  for (const s of segments) {
    if (s.kind === "endcard") continue;
    const startSec = s.startMs / 1000;
    const durSec = s.durationMs / 1000;
    if (s.kind === "scene") {
      times.push({ label: `${s.id}-a`, tSec: startSec + durSec * 0.35 });
      times.push({ label: `${s.id}-b`, tSec: startSec + durSec * 0.85 });
    } else {
      times.push({ label: s.kind, tSec: startSec + durSec * 0.5 });
    }
  }
  const capped = times.slice(0, MAX_FRAMES);
  // Clamp inside the video: rounding and the compressed tail can push the
  // last sample past the end.
  return capped.map((t) => ({ ...t, tSec: Math.min(Math.max(t.tSec, 0), Math.max(0, durationSec - 0.2)) }));
}

function extractFrames(mp4Path: string, segments: SegmentTiming[], durationSec: number, outDir: string): string[] {
  mkdirSync(outDir, { recursive: true });
  const paths: string[] = [];
  for (const { label, tSec } of frameTimesForSegments(segments, durationSec)) {
    const framePath = join(outDir, `frame-${label}.jpg`);
    execFileSync(FFMPEG, ["-y", "-ss", tSec.toFixed(2), "-i", mp4Path, "-frames:v", "1", "-q:v", "2", framePath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    paths.push(framePath);
  }
  return paths;
}

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------

export async function runLocalPipeline(params: {
  site: string;
  options: RunOptions;
  label?: string;
  runDir: string; // logs/current run dir (from initRunDir)
  log: LocalLogger;
}): Promise<LocalRunResult> {
  const { site, options, label, runDir, log } = params;
  const startedAt = new Date();
  const runId = `local-${startedAt.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const iterDir = join(runDir, "training", runId);
  const mapShotsDir = join(iterDir, "map-shots");
  mkdirSync(mapShotsDir, { recursive: true });

  const collected: Collected = { events: [], pages: [] };
  const emitter = makeLocalEmitter(collected, mapShotsDir, log);
  const addEvent = async (agent: RunEvent["agent"], level: "info" | "error", message: string, url?: string) => {
    await emitter.emit({ kind: "event", event: { agent, level, message, ...(url ? { url } : {}) } });
  };

  // Recorder code wants the shared Logger shape; route it into the training
  // log with a tag so one file holds the whole run.
  const recLog = {
    info: (msg: string, extra?: unknown) => log.info(`[recorder] ${msg}${extra !== undefined ? " " + JSON.stringify(extra) : ""}`),
    error: (msg: string, extra?: unknown) => log.error(`[recorder] ${msg}${extra !== undefined ? " " + JSON.stringify(extra) : ""}`),
  };

  const format = options.format ?? "horizontal";
  const artifacts: LocalRunArtifacts = {
    iterDir,
    eventsPath: join(iterDir, "events.json"),
    metaPath: join(iterDir, "run-meta.json"),
    mapShotsDir,
    framePaths: [],
  };
  const writeEvents = () => writeFileSync(artifacts.eventsPath, JSON.stringify(collected.events, null, 2));

  const totalStart = Date.now();
  log.info(`local run ${runId}: ${site} (options ${JSON.stringify(options)})`);

  // Scout and Mapper in parallel, exactly like the product (convex/http.ts
  // schedules both; either failing fails the run).
  let scoutMs = 0;
  let mapMs = 0;
  const scoutPromise = (async () => {
    const t = Date.now();
    const res = await runScout(site, (level, message, url) => addEvent("scout", level, message, url));
    scoutMs = Date.now() - t;
    await addEvent("scout", "info", `brief ready: ${res.brief}`);
    return res;
  })();
  const mapPromise = (async () => {
    const t = Date.now();
    await runMap(
      {
        runId,
        callbackUrl: "http://localhost/unused-local",
        runToken: "local",
        url: site,
        credentials: options.credentials,
        format,
      },
      emitter,
      recLog,
    );
    mapMs = Date.now() - t;
  })();
  const [scout] = await Promise.all([scoutPromise, mapPromise]);
  writeEvents();
  log.info(`scout done in ${Math.round(scoutMs / 1000)}s, map done in ${Math.round(mapMs / 1000)}s (${collected.pages.length} pages)`);

  // Director.
  await addEvent("director", "info", "writing the storyboard");
  let thinkingText = "";
  const directorStart = Date.now();
  const { decision, usage: directorUsage } = await generateStoryboard({
    url: site,
    brief: scout.brief,
    pages: collected.pages,
    options,
    guidance: options.guidance,
    sceneRange: LENGTH_TO_SCENES[options.length],
    progress: {
      write: async ({ thinking }) => {
        thinkingText = thinking;
      },
      sceneDrafted: async (index, scene) => {
        await addEvent("director", "info", `scene ${index + 1} drafted: ${scene.title}`);
      },
    },
  });
  const directorMs = Date.now() - directorStart;
  if (thinkingText) {
    artifacts.thinkingPath = join(iterDir, "director-thinking.txt");
    writeFileSync(artifacts.thinkingPath, thinkingText);
  }

  const writeMeta = (extra: Record<string, unknown>) =>
    writeFileSync(
      artifacts.metaPath,
      JSON.stringify(
        {
          runId,
          site,
          label: label ?? null,
          startedAt: startedAt.toISOString(),
          mode: "local",
          options,
          promptVersions: { scout: SCOUT_PROMPT_VERSION, director: DIRECTOR_PROMPT_VERSION },
          models: { scout: SCOUT_MODEL, director: DIRECTOR_MODEL, tts: "gpt-4o-mini-tts" },
          pages: collected.pages.length,
          ...extra,
        },
        null,
        2,
      ),
    );

  // Same decision logic as the Convex action: no credentials and nothing
  // presentable is a legitimate stop; asking for credentials although they
  // were provided is a bug.
  if (decision.needsCredentials) {
    if (options.credentials.mode === "none") {
      await addEvent("director", "info", `needs credentials: ${decision.reason}`);
      writeEvents();
      writeMeta({ status: "needs_credentials", reason: decision.reason });
      return { kind: "needs_credentials", runId, reason: decision.reason, brief: scout.brief, artifacts };
    }
    throw new Error(`director requested credentials although credentials were provided: ${decision.reason}`);
  }
  const storyboard = decision.storyboard;
  if (!storyboard) throw new Error("director returned needsCredentials=false without a storyboard");

  artifacts.storyboardPath = join(iterDir, "storyboard.json");
  writeFileSync(artifacts.storyboardPath, JSON.stringify(storyboard, null, 2));
  await addEvent("director", "info", `storyboard ready: ${storyboard.scenes.map((s) => s.title).join(", ")}`);

  // Presenter: same account-reuse rule as the Convex action — a signup
  // account created during mapping is logged into, never created twice.
  const recordCredentials = collected.credentialsUsed
    ? { mode: "login" as const, email: collected.credentialsUsed.email, password: collected.credentialsUsed.password }
    : options.credentials;

  const recordStart = Date.now();
  const result = await runRecording({
    runId,
    storyboard,
    options: { voice: options.voice, zoom: options.zoom, captions: options.captions, format },
    credentials: recordCredentials,
    outDir: iterDir,
    tts: true,
    emit: emitter,
    log: recLog,
  });
  const recordMs = Date.now() - recordStart;
  writeEvents();

  artifacts.mp4Path = result.mp4Path;
  if (result.captionsVtt) {
    artifacts.vttPath = join(iterDir, "captions.vtt");
    writeFileSync(artifacts.vttPath, result.captionsVtt);
  }
  artifacts.framePaths = extractFrames(result.mp4Path, result.segments, result.durationSec, join(iterDir, "frames"));
  log.info(`extracted ${artifacts.framePaths.length} frames near scene beats`);

  const ttsAudioMs = result.segments.filter((s) => s.kind !== "endcard").reduce((a, s) => a + s.durationMs, 0);
  const cost: CostReport = {
    scout: { model: SCOUT_MODEL, ...scout.usage, usd: modelUsd(SCOUT_MODEL, scout.usage) },
    director: { model: DIRECTOR_MODEL, ...directorUsage, usd: modelUsd(DIRECTOR_MODEL, directorUsage) },
    ttsAudioSec: Math.round(ttsAudioMs / 1000),
    ttsUsd: (ttsAudioMs / 60_000) * TTS_USD_PER_MIN,
    totalUsd: 0,
    note: "Tavily search not metered; TTS estimated from audio minutes at the models.md rate",
  };
  cost.totalUsd = cost.scout.usd + cost.director.usd + cost.ttsUsd;

  const phases: PhaseTimings = { scoutMs, mapMs, directorMs, recordMs, totalMs: Date.now() - totalStart };
  writeMeta({
    status: "done",
    durationSec: result.durationSec,
    segments: result.segments,
    phases,
    cost,
    artifacts: {
      mp4: artifacts.mp4Path,
      vtt: artifacts.vttPath ?? null,
      storyboard: artifacts.storyboardPath,
      frames: artifacts.framePaths.length,
      mapShots: artifacts.mapShotsDir,
    },
  });

  return {
    kind: "done",
    runId,
    brief: scout.brief,
    events: collected.events,
    durationSec: result.durationSec,
    segments: result.segments,
    cost,
    phases,
    promptVersions: { scout: SCOUT_PROMPT_VERSION, director: DIRECTOR_PROMPT_VERSION },
    artifacts,
  };
}
