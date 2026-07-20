#!/usr/bin/env -S npx tsx
// Training-loop runner. See docs/training/loop.md.
//
// Two modes:
// - --local (the training default): runs the ACTUAL pipeline code from this
//   working tree in-process (scripts/local.ts) — no UI, no Convex deployment,
//   same OpenAI requests and models as production. Artifacts (storyboard,
//   events, map screenshots, video, captions, beat-anchored frames, cost)
//   land in logs/current/training/<runId>/ for Claude to judge.
// - remote (no flag): drives a deployed Convex backend over the public HTTP
//   API (docs/api/http.md) — the smoke test for what is actually deployed.
//
// The gpt judge is DISABLED by default (Claude is the judge —
// docs/training/loop.md); pass --judge in remote mode to run the legacy
// gpt-5.6-sol judge.
//
// Usage:
//   npx tsx scripts/train.ts --site <url> [--local] [--base <url>] [--runs N]
//     [--signup <emailDomain> | --email <e> --password <p>]
//     [--format horizontal|vertical] [--length short|medium|long]
//     [--guidance <text>] [--label <name>] [--judge]
//
// No hidden fallbacks: every failure (run failed, timed out, malformed judge
// output) is written to the report and the process exits non-zero.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateObject, NoObjectGeneratedError } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { createLogger, initRunDir } from "@prezik/shared/logger";
import { LENGTH_TO_SCENES } from "@prezik/shared";
import type { RunEvent, RunOptions, RunStatus } from "@prezik/shared";
import { runLocalPipeline, type CostReport, type PhaseTimings } from "./local";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOGS_ROOT = join(REPO_ROOT, "logs");
const DEFAULT_BASE = "https://polished-chicken-876.eu-west-1.convex.site";
const COUPON_CODE = "tech-europe-hackathon";
const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 15 * 60_000;
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const FFPROBE = "/opt/homebrew/bin/ffprobe";
const FRAME_COUNT = 6; // remote mode only; local mode samples near scene beats
const JUDGE_MODEL = "gpt-5.6-sol"; // legacy --judge only; Claude judges by default

const USAGE = `Usage: npx tsx scripts/train.ts --site <url> [--local] [--base <url>] [--runs N] [--signup <emailDomain> | --email <e> --password <p>]

  --site      required. Target web app to run the Prezik pipeline against.
  --local     run the pipeline in-process from this working tree (no Convex
              deployment; same models/OpenAI calls as production). Needs
              OPENAI_API_KEY and TAVILY_API_KEY in the root .env.
  --base      remote mode only: Convex HTTP actions URL. Default: ${DEFAULT_BASE}
  --runs      how many times to repeat, sequentially, each with a fresh session. Default: 1
  --signup    if set, requests credentials.mode "signup" with this email domain (default: mode "none")
  --email     with --password, requests credentials.mode "login" using these test credentials
  --password  with --email, the password for the test login (both are required together)
  --format    "horizontal" (default) or "vertical" — video orientation
  --length    "short" (default), "medium", or "long" — video length
  --guidance  free-form user guidance passed to the Director (as in the UI field)
  --label     short name for this iteration, recorded in run-meta and the report
              (use for A/B runs, e.g. "director-v8-baseline" vs "director-v9")
  --judge     remote mode only: run the legacy ${JUDGE_MODEL} judge. Off by default —
              Claude judges from the artifacts (docs/training/loop.md).

  --signup and --email/--password are mutually exclusive.`;

// ---------------------------------------------------------------------------
// Judge output schema (step 5)
// ---------------------------------------------------------------------------

const ScoreDim = z.object({
  score: z.number().int().min(1).max(5),
  justification: z.string().min(1),
});
type ScoreDim = z.infer<typeof ScoreDim>;

const JudgeResult = z.object({
  coverageOfRealFeatures: ScoreDim,
  narrationAccuracy: ScoreDim,
  actionQuality: ScoreDim,
  pacing: ScoreDim,
  visualPolish: ScoreDim,
  proposals: z.array(
    z.object({
      promptFile: z.string().min(1),
      change: z.string().min(1),
      why: z.string().min(1),
    }),
  ),
});
type JudgeResult = z.infer<typeof JudgeResult>;

// ---------------------------------------------------------------------------
// Public HTTP API types (docs/api/http.md)
// ---------------------------------------------------------------------------

interface RunDoc {
  _id: string;
  url: string;
  status: RunStatus;
  options: RunOptions;
  brief?: string;
  guidance?: string;
  credentialsUsed?: { email: string; password: string };
  playbackUrl?: string;
  captionsUrl?: string;
  durationSec?: number;
  error?: string;
  needsCredentialsReason?: string;
}

interface RunEventDoc extends RunEvent {
  seq: number;
}

// Extra facts a local (in-process) run knows about itself that a remote run
// cannot see: exact cost, phase timings, prompt versions, storyboard on disk.
interface LocalExtras {
  cost: CostReport;
  phases: PhaseTimings;
  promptVersions: { scout: number; director: number };
  storyboardPath?: string;
  metaPath: string;
  mapShotsDir: string;
}

type IterationResult =
  | {
      kind: "done";
      runId: string;
      judge?: JudgeResult; // present only when the legacy --judge ran
      mp4Path: string;
      framePaths: string[];
      vttPath?: string;
      local?: LocalExtras;
    }
  | { kind: "failed"; runId?: string; reason: string }
  | { kind: "needs_credentials"; runId: string; reason: string };

// ---------------------------------------------------------------------------
// CLI + env
// ---------------------------------------------------------------------------

const BOOLEAN_FLAGS = new Set(["local", "judge"]);

function parseArgs(argv: string[]): {
  site: string;
  base: string;
  runs: number;
  signupDomain?: string;
  login?: { email: string; password: string };
  format: "horizontal" | "vertical";
  length: "short" | "medium" | "long";
  guidance?: string;
  label?: string;
  local: boolean;
  judge: boolean;
} {
  const flags: Record<string, string> = {};
  const bools = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`unexpected argument "${arg}"\n\n${USAGE}`);
    const key = arg.slice(2);
    if (BOOLEAN_FLAGS.has(key)) {
      bools.add(key);
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`flag --${key} needs a value\n\n${USAGE}`);
    flags[key] = value;
    i++;
  }
  if (!flags.site) throw new Error(USAGE);
  const runs = flags.runs ? Number(flags.runs) : 1;
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error(`--runs must be a positive integer, got "${flags.runs}"\n\n${USAGE}`);
  }

  // --email and --password are all-or-nothing, and can't be combined with --signup.
  if ((flags.email === undefined) !== (flags.password === undefined)) {
    throw new Error(`--email and --password must be given together\n\n${USAGE}`);
  }
  const login = flags.email !== undefined ? { email: flags.email, password: flags.password } : undefined;
  if (login && flags.signup !== undefined) {
    throw new Error(`--signup and --email/--password are mutually exclusive\n\n${USAGE}`);
  }

  const format = flags.format ?? "horizontal";
  if (format !== "horizontal" && format !== "vertical") {
    throw new Error(`--format must be "horizontal" or "vertical", got "${flags.format}"\n\n${USAGE}`);
  }
  const length = flags.length ?? "short";
  if (length !== "short" && length !== "medium" && length !== "long") {
    throw new Error(`--length must be "short", "medium" or "long", got "${flags.length}"\n\n${USAGE}`);
  }

  const local = bools.has("local");
  const judge = bools.has("judge");
  if (local && judge) {
    throw new Error(`--judge is remote-mode only; in --local mode Claude judges from the artifacts\n\n${USAGE}`);
  }

  return {
    site: flags.site,
    base: (flags.base ?? DEFAULT_BASE).replace(/\/+$/, ""),
    runs,
    signupDomain: flags.signup,
    login,
    format,
    length,
    guidance: flags.guidance,
    label: flags.label,
    local,
    judge,
  };
}

// Zero-dependency .env loading (Node's built-in process.loadEnvFile). A
// missing root .env is only a problem if OPENAI_API_KEY isn't already in the
// environment some other way — checked explicitly in main().
function loadEnv(): void {
  try {
    process.loadEnvFile(join(REPO_ROOT, ".env"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

// ---------------------------------------------------------------------------
// Small utils
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function withTag(tag: string, msg: string): string {
  return tag ? `${tag} ${msg}` : msg;
}

interface DualLogger {
  info(msg: string): void;
  error(msg: string): void;
}

function makeDualLogger(fileLogger: ReturnType<typeof createLogger>): DualLogger {
  return {
    info(msg: string) {
      console.log(msg);
      fileLogger.info(msg);
    },
    error(msg: string) {
      console.error(msg);
      fileLogger.error(msg);
    },
  };
}

interface ApiResponse {
  status: number;
  body: any;
}

async function apiRequest(base: string, path: string, init?: RequestInit): Promise<ApiResponse> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`non-JSON response from ${path} (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }
  }
  return { status: res.status, body };
}

function describeApiError(res: ApiResponse): string {
  return typeof res.body?.error === "string" ? res.body.error : `HTTP ${res.status}`;
}

function runTool(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: Buffer | string };
    const stderr = e.stderr ? String(e.stderr).slice(0, 1500) : "";
    throw new Error(`${cmd} ${args.join(" ")} failed: ${e.message}${stderr ? `\n${stderr}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// Step 1: start a run, redeeming the hackathon coupon on a no-credits error
// ---------------------------------------------------------------------------

// Defaults match what the UI sends (app/src/features/start/LinkStepScreen.tsx).
function buildRunOptions(
  signupDomain: string | undefined,
  login: { email: string; password: string } | undefined,
  format: "horizontal" | "vertical",
  length: "short" | "medium" | "long",
  guidance: string | undefined,
): RunOptions {
  const credentials: RunOptions["credentials"] = login
    ? { mode: "login", email: login.email, password: login.password }
    : signupDomain
      ? { mode: "signup", emailDomain: signupDomain }
      : { mode: "none" };
  return {
    voice: "neutral",
    zoom: true,
    length,
    captions: true,
    format,
    ...(guidance ? { guidance } : {}),
    credentials,
  };
}

async function startRun(
  base: string,
  site: string,
  options: RunOptions,
  log: DualLogger,
  tag: string,
): Promise<{ runId: string; sessionId: string; runToken: string }> {
  log.info(withTag(tag, `POST /api/runs ${site}`));
  let res = await apiRequest(base, "/api/runs", { method: "POST", body: JSON.stringify({ url: site, options }) });

  if (res.status !== 200) {
    const message = describeApiError(res);
    const sessionId = res.body?.sessionId as string | undefined;
    if (!sessionId || !/credit/i.test(message)) {
      throw new Error(`POST /api/runs failed (${res.status}): ${message}`);
    }

    log.info(withTag(tag, `no credits on session ${sessionId} ("${message}"); redeeming coupon "${COUPON_CODE}"`));
    const coupon = await apiRequest(base, `/api/sessions/${sessionId}/coupon`, {
      method: "POST",
      body: JSON.stringify({ code: COUPON_CODE }),
    });
    if (coupon.status !== 200) {
      throw new Error(`coupon redemption failed (${coupon.status}): ${describeApiError(coupon)}`);
    }
    log.info(withTag(tag, `coupon redeemed: credits=${coupon.body.credits}`));

    log.info(withTag(tag, `retrying POST /api/runs with sessionId=${sessionId}`));
    res = await apiRequest(base, "/api/runs", { method: "POST", body: JSON.stringify({ url: site, options, sessionId }) });
    if (res.status !== 200) {
      throw new Error(`POST /api/runs failed again after coupon redemption (${res.status}): ${describeApiError(res)}`);
    }
  }

  const { runId, sessionId, runToken } = res.body as { runId: string; sessionId: string; runToken: string };
  log.info(withTag(tag, `run started: runId=${runId} sessionId=${sessionId}`));
  return { runId, sessionId, runToken };
}

// ---------------------------------------------------------------------------
// Step 2: poll for completion, streaming events as they arrive
// ---------------------------------------------------------------------------

async function pollRun(base: string, runId: string, log: DualLogger, tag: string): Promise<{ run: RunDoc; events: RunEventDoc[] }> {
  const events: RunEventDoc[] = [];
  let after = 0;
  const startedAt = Date.now();

  const pullEvents = async () => {
    const res = await apiRequest(base, `/api/runs/${runId}/events?after=${after}`);
    if (res.status !== 200) throw new Error(`GET /api/runs/${runId}/events failed (${res.status}): ${describeApiError(res)}`);
    const batch: RunEventDoc[] = res.body?.events ?? [];
    for (const e of batch) {
      events.push(e);
      after = Math.max(after, e.seq);
      const line = `${e.level === "error" ? "ERROR " : ""}[${e.agent}] ${e.message}${e.url ? ` (${e.url})` : ""}`;
      log.info(withTag(tag, line));
    }
  };

  for (;;) {
    await pullEvents();

    const res = await apiRequest(base, `/api/runs/${runId}`);
    if (res.status !== 200) throw new Error(`GET /api/runs/${runId} failed (${res.status}): ${describeApiError(res)}`);
    const run = res.body as RunDoc;

    if (run.status === "done" || run.status === "failed" || run.status === "needs_credentials") {
      await pullEvents(); // catch anything written between the two requests above
      return { run, events };
    }

    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error(`timed out after 15 minutes polling run ${runId} (last status: "${run.status}")`);
    }
    log.info(withTag(tag, `status=${run.status}, polling again in 15s`));
    await sleep(POLL_INTERVAL_MS);
  }
}

// ---------------------------------------------------------------------------
// Step 4: download the video, extract frames, fetch captions
// ---------------------------------------------------------------------------

async function downloadFile(url: string, destPath: string, log: DualLogger, tag: string): Promise<void> {
  log.info(withTag(tag, `downloading ${url}`));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to download ${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
  log.info(withTag(tag, `saved ${buf.length} bytes to ${destPath}`));
}

function getDurationSec(mp4Path: string): number {
  const out = runTool(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", mp4Path]);
  const seconds = Number(out.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`ffprobe returned an unusable duration for ${mp4Path}: "${out.trim()}"`);
  return seconds;
}

function extractFrames(mp4Path: string, durationSec: number, outDir: string): string[] {
  mkdirSync(outDir, { recursive: true });
  const paths: string[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const t = (durationSec * (i + 0.5)) / FRAME_COUNT;
    const framePath = join(outDir, `frame-${i + 1}.jpg`);
    runTool(FFMPEG, ["-y", "-ss", t.toFixed(2), "-i", mp4Path, "-frames:v", "1", "-q:v", "2", framePath]);
    paths.push(framePath);
  }
  return paths;
}

async function fetchCaptions(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch captions ${url}: HTTP ${res.status}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Step 5: judge
// ---------------------------------------------------------------------------

const JUDGE_INSTRUCTIONS =
  "You are a strict, factual QA judge for Prezik, a tool that films narrated product demo videos automatically. " +
  "You score one finished run and propose concrete prompt edits. Be concise. Every score needs a one-sentence, " +
  "evidence-based justification — do not invent evidence you were not given.";

function buildJudgeText(input: {
  site: string;
  runId: string;
  options: RunOptions;
  brief: string;
  events: RunEventDoc[];
  vttText: string;
  durationSec: number;
}): string {
  const eventsText = input.events.map((e) => `[${e.agent}] ${e.message}`).join("\n") || "(no events recorded)";
  const sceneRange = LENGTH_TO_SCENES[input.options.length];

  return `Target site: ${input.site}
Run id: ${input.runId}
Run options: ${JSON.stringify(input.options)}
Video duration: ${input.durationSec}s
Expected scene count for length "${input.options.length}" (excluding intro/outro): ${sceneRange.min}-${sceneRange.max}

Product brief (written by a separate research agent from the site's own content — treat as ground truth about what the product actually does):
"""
${input.brief || "(no brief was recorded for this run)"}
"""

Full agent event log for this run, chronological (includes scene titles, page coverage, and any errors):
"""
${eventsText}
"""

Narration captions (WebVTT, what was actually spoken over the video, in order):
"""
${input.vttText}
"""

You do NOT have the raw storyboard (the exact list of clicks/fills/gotos per scene) — there is currently no read API for it. Infer actionQuality from: the narration's language (does it describe interacting with the product — "let's click", "typing in", "adding a" — versus only describing what's visible while the page merely navigates), the scene titles in the event log, and the 6 attached frames (evenly spaced across the video — look for cursor position, highlighted elements, filled form fields, zoomed regions, and whether the frames show varied, changing page states versus a static tour). Say so plainly in the justification when the evidence is thin or inconclusive rather than guessing.

Score each dimension 1-5 (5 is best) with one factual, evidence-based sentence of justification each:
- coverageOfRealFeatures: does the demo show features that are actually in the brief, and does it cover the product's main points?
- narrationAccuracy: does the narration only claim things supported by the brief? Name any invented claim you find.
- actionQuality: did scenes interact with the page (click, fill, hover, zoom) or mostly just navigate (goto)?
- pacing: given the video length and scene count above, does it feel rushed, dragging, or well-paced?
- visualPolish: judge from the attached frames — layout, zoom quality, whether the UI looks broken, cut off, or blank.

Then list concrete prompt-change proposals to improve future runs against this kind of site. Prompt files live in app/convex/prompts/ — currently scout.ts (writes the product brief) and director.ts (writes the storyboard: scene count, actions, narration). Each proposal must name a real prompt file, describe one specific, actionable change, and explain why in terms of what you actually observed in this run's events, captions, or frames.`;
}

async function callJudge(promptText: string, frames: Buffer[], retryNote: string): Promise<JudgeResult> {
  const { object } = await generateObject({
    model: openai(JUDGE_MODEL),
    schema: JudgeResult,
    instructions: JUDGE_INSTRUCTIONS,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: promptText + retryNote },
          ...frames.map((data) => ({ type: "file" as const, data, mediaType: "image/jpeg" })),
        ],
      },
    ],
  });
  return object;
}

function describeAiError(err: unknown): string {
  if (NoObjectGeneratedError.isInstance(err)) {
    const raw = err.text ? ` — raw output: ${err.text.slice(0, 500)}` : "";
    return `${err.message}${raw}`;
  }
  return err instanceof Error ? err.message : String(err);
}

// Product rule (AGENTS.md): malformed AI output gets exactly one re-prompt
// with the validation error attached, then this fails visibly. No default
// substitution, no silent recovery.
async function judgeRun(promptText: string, frames: Buffer[], log: DualLogger, tag: string): Promise<JudgeResult> {
  try {
    return await callJudge(promptText, frames, "");
  } catch (firstErr) {
    const note = describeAiError(firstErr);
    log.error(withTag(tag, `judge output invalid, retrying once: ${note}`));
    try {
      return await callJudge(
        promptText,
        frames,
        `\n\nYour previous response was invalid: ${note}\nFix this and answer again, following the schema exactly.`,
      );
    } catch (secondErr) {
      throw new Error(`judge output still invalid after one retry: ${describeAiError(secondErr)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// One full pipeline run (steps 1-5)
// ---------------------------------------------------------------------------

async function judgeDoneRun(
  run: RunDoc,
  events: RunEventDoc[],
  log: DualLogger,
  tag: string,
  iterDir: string,
  judgeEnabled: boolean,
) {
  if (!run.playbackUrl) throw new Error(`run ${run._id} is "done" but has no playbackUrl`);

  const mp4Path = join(iterDir, "video.mp4");
  await downloadFile(run.playbackUrl, mp4Path, log, tag);

  const durationSec = getDurationSec(mp4Path);
  log.info(withTag(tag, `video duration: ${durationSec}s`));

  const framesDir = join(iterDir, "frames");
  const framePaths = extractFrames(mp4Path, durationSec, framesDir);
  log.info(withTag(tag, `extracted ${framePaths.length} frames`));

  let vttText = "(no captions available for this run)";
  let vttPath: string | undefined;
  if (run.captionsUrl) {
    vttText = await fetchCaptions(run.captionsUrl);
    vttPath = join(iterDir, "captions.vtt");
    writeFileSync(vttPath, vttText);
  } else {
    log.error(withTag(tag, "run has no captionsUrl despite captions being requested; judging without narration text"));
  }

  if (!judgeEnabled) {
    log.info(withTag(tag, "gpt judge disabled (default) — artifacts saved for the Claude judge"));
    return { judge: undefined, mp4Path, framePaths, vttPath };
  }

  const promptText = buildJudgeText({
    site: run.url,
    runId: run._id,
    options: run.options,
    brief: run.brief ?? "",
    events,
    vttText,
    durationSec,
  });
  const frameBuffers = framePaths.map((p) => readFileSync(p));

  const judge = await judgeRun(promptText, frameBuffers, log, tag);
  log.info(withTag(tag, "judge scored the run"));

  return { judge, mp4Path, framePaths, vttPath };
}

async function trainOnce(params: {
  base: string;
  site: string;
  options: RunOptions;
  tag: string;
  runDir: string;
  log: DualLogger;
  judgeEnabled: boolean;
}): Promise<IterationResult> {
  const { base, site, options, tag, runDir, log, judgeEnabled } = params;
  let runId: string | undefined;
  try {
    const started = await startRun(base, site, options, log, tag);
    runId = started.runId;

    const { run, events } = await pollRun(base, started.runId, log, tag);

    if (run.status === "failed") {
      return { kind: "failed", runId: run._id, reason: run.error ?? 'run status is "failed" but no error message was recorded' };
    }
    if (run.status === "needs_credentials") {
      return {
        kind: "needs_credentials",
        runId: run._id,
        reason: run.needsCredentialsReason ?? "the site requires sign-in and no credentials were provided",
      };
    }
    if (run.status !== "done") {
      // pollRun only returns on "done"/"failed"/"needs_credentials", or throws on timeout.
      throw new Error(`unexpected terminal run status "${run.status}"`);
    }

    log.info(withTag(tag, "run done: downloading video and collecting artifacts"));
    const iterDir = join(runDir, "training", run._id);
    mkdirSync(iterDir, { recursive: true });
    const judged = await judgeDoneRun(run, events, log, tag, iterDir, judgeEnabled);
    return { kind: "done", runId: run._id, ...judged };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { kind: "failed", runId, reason };
  }
}

// One --local iteration: the whole pipeline in-process (scripts/local.ts).
async function localOnce(params: {
  site: string;
  options: RunOptions;
  label?: string;
  tag: string;
  runDir: string;
  log: DualLogger;
}): Promise<IterationResult> {
  const { site, options, label, tag, runDir, log } = params;
  try {
    const result = await runLocalPipeline({
      site,
      options,
      label,
      runDir,
      log: {
        info: (msg) => log.info(withTag(tag, msg)),
        error: (msg) => log.error(withTag(tag, msg)),
      },
    });
    if (result.kind === "needs_credentials") {
      return { kind: "needs_credentials", runId: result.runId, reason: result.reason };
    }
    if (!result.artifacts.mp4Path) throw new Error(`local run ${result.runId} is "done" but produced no mp4`);
    return {
      kind: "done",
      runId: result.runId,
      mp4Path: result.artifacts.mp4Path,
      framePaths: result.artifacts.framePaths,
      vttPath: result.artifacts.vttPath,
      local: {
        cost: result.cost,
        phases: result.phases,
        promptVersions: result.promptVersions,
        storyboardPath: result.artifacts.storyboardPath,
        metaPath: result.artifacts.metaPath,
        mapShotsDir: result.artifacts.mapShotsDir,
      },
    };
  } catch (err) {
    return { kind: "failed", reason: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Step 6: report
// ---------------------------------------------------------------------------

function renderScoreLine(label: string, dim: ScoreDim): string {
  return `- **${label}: ${dim.score}/5** — ${dim.justification}`;
}

function writeReport(
  meta: { site: string; mode: "local" | "remote"; base: string; runsRequested: number; label?: string },
  results: IterationResult[],
  runDir: string,
  logsRoot: string,
): string {
  const lines: string[] = [];
  lines.push("# Prezik training report");
  lines.push("");
  lines.push(`Site: ${meta.site}`);
  lines.push(`Mode: ${meta.mode}${meta.mode === "remote" ? ` (API base: ${meta.base})` : " (in-process, this working tree)"}`);
  if (meta.label) lines.push(`Label: ${meta.label}`);
  lines.push(`Runs completed: ${results.length}/${meta.runsRequested}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  results.forEach((r, i) => {
    const label = results.length > 1 ? `Run ${i + 1}/${results.length}` : "Run";
    lines.push(`## ${label}${r.runId ? ` — ${r.runId}` : " — never started"}`);
    lines.push("");

    if (r.kind === "failed") {
      lines.push("Result: FAILED");
      lines.push("");
      lines.push(r.reason);
      lines.push("");
      lines.push("Full agent log: logs/current/training.log");
      lines.push("");
      return;
    }

    if (r.kind === "needs_credentials") {
      lines.push("Result: NEEDS CREDENTIALS");
      lines.push("");
      lines.push(`${r.reason} — rerun with --email/--password (or --signup) to record this product.`);
      lines.push("");
      return;
    }

    lines.push("Result: done");
    lines.push("");
    if (r.judge) {
      lines.push("### Scores (1-5)");
      lines.push("");
      lines.push(renderScoreLine("Coverage of real features", r.judge.coverageOfRealFeatures));
      lines.push(renderScoreLine("Narration accuracy", r.judge.narrationAccuracy));
      lines.push(renderScoreLine("Action quality", r.judge.actionQuality));
      lines.push(renderScoreLine("Pacing", r.judge.pacing));
      lines.push(renderScoreLine("Visual polish", r.judge.visualPolish));
      lines.push("");
      lines.push("### Prompt-change proposals");
      lines.push("");
      if (r.judge.proposals.length === 0) {
        lines.push("(none — judge found nothing to change)");
      } else {
        r.judge.proposals.forEach((p, idx) => {
          lines.push(`${idx + 1}. **${p.promptFile}** — ${p.change}`);
          lines.push(`   Why: ${p.why}`);
        });
      }
      lines.push("");
    } else {
      lines.push("Scores: judged by Claude from the artifacts below (docs/training/loop.md, step 3).");
      lines.push("Append the verdict to docs/training/scoreboard.md.");
      lines.push("");
    }
    if (r.local) {
      lines.push("### Run facts (local mode)");
      lines.push("");
      lines.push(`- prompt versions: scout v${r.local.promptVersions.scout}, director v${r.local.promptVersions.director}`);
      const c = r.local.cost;
      lines.push(
        `- cost: $${c.totalUsd.toFixed(4)} total — scout $${c.scout.usd.toFixed(4)} (${c.scout.inputTokens}/${c.scout.outputTokens} tok), ` +
          `director $${c.director.usd.toFixed(4)} (${c.director.inputTokens}/${c.director.outputTokens} tok), ` +
          `tts ~$${c.ttsUsd.toFixed(4)} (${c.ttsAudioSec}s audio). ${c.note}.`,
      );
      const p = r.local.phases;
      lines.push(
        `- phases: scout ${Math.round(p.scoutMs / 1000)}s, map ${Math.round(p.mapMs / 1000)}s, ` +
          `director ${Math.round(p.directorMs / 1000)}s, record ${Math.round(p.recordMs / 1000)}s, total ${Math.round(p.totalMs / 1000)}s`,
      );
      lines.push("");
    }
    lines.push("### Artifacts");
    lines.push("");
    lines.push(`- video: ${relative(logsRoot, r.mp4Path)}`);
    lines.push(`- frames: ${r.framePaths.length} (${relative(logsRoot, dirname(r.framePaths[0]))})`);
    lines.push(`- captions: ${r.vttPath ? relative(logsRoot, r.vttPath) : "(none)"}`);
    if (r.local) {
      lines.push(`- storyboard: ${r.local.storyboardPath ? relative(logsRoot, r.local.storyboardPath) : "(none)"}`);
      lines.push(`- map screenshots: ${relative(logsRoot, r.local.mapShotsDir)}`);
      lines.push(`- run meta (cost, timings, segments): ${relative(logsRoot, r.local.metaPath)}`);
    }
    lines.push("");
  });

  const content = lines.join("\n");
  writeFileSync(join(runDir, "training-report.md"), content);
  return join(logsRoot, "current", "training-report.md");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = parseArgs(process.argv.slice(2));
  loadEnv();
  // Local mode calls OpenAI directly; remote mode only needs a key for --judge.
  if ((argv.local || argv.judge) && !process.env.OPENAI_API_KEY) {
    throw new Error(`OPENAI_API_KEY is not set (expected in ${join(REPO_ROOT, ".env")} — see docs/setup/start.md)`);
  }
  if (argv.local && !process.env.TAVILY_API_KEY) {
    throw new Error(`TAVILY_API_KEY is not set (expected in ${join(REPO_ROOT, ".env")} — Scout needs it in --local mode)`);
  }

  const fileLogger = createLogger("training", LOGS_ROOT);
  const runDir = initRunDir(LOGS_ROOT);
  const log = makeDualLogger(fileLogger);

  const credentialsTag = argv.login
    ? ` login=${argv.login.email}`
    : argv.signupDomain
      ? ` signup=${argv.signupDomain}`
      : "";
  const mode = argv.local ? "local" : "remote";
  log.info(
    `training loop: site=${argv.site} mode=${mode}${argv.local ? "" : ` base=${argv.base}`} runs=${argv.runs}` +
      `${credentialsTag}${argv.label ? ` label=${argv.label}` : ""}`,
  );

  const options = buildRunOptions(argv.signupDomain, argv.login, argv.format, argv.length, argv.guidance);
  const results: IterationResult[] = [];

  for (let i = 1; i <= argv.runs; i++) {
    const tag = argv.runs > 1 ? `[${i}/${argv.runs}]` : "";
    log.info(withTag(tag, `starting ${mode} training run against ${argv.site}`));
    const result = argv.local
      ? await localOnce({ site: argv.site, options, label: argv.label, tag, runDir, log })
      : await trainOnce({ base: argv.base, site: argv.site, options, tag, runDir, log, judgeEnabled: argv.judge });
    results.push(result);
    if (result.kind === "failed") {
      log.error(withTag(tag, `FAILED: ${result.reason}`));
    } else {
      log.info(withTag(tag, `done: runId=${result.runId}`));
    }
  }

  const reportPath = writeReport(
    { site: argv.site, mode, base: argv.base, runsRequested: argv.runs, label: argv.label },
    results,
    runDir,
    LOGS_ROOT,
  );
  console.log(`report: ${reportPath}`);

  process.exitCode = results.some((r) => r.kind === "failed") ? 1 : 0;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
