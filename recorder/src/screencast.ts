import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CDPSession, Page } from "playwright";
import type { Logger } from "./log.js";

// Our own CDP screencast instead of Playwright's recordVideo. recordVideo
// re-encodes the same screencast to VP8 at a fixed low bitrate, which looks
// muddy; we keep the JPEG frames (quality 80) with their timestamps and let
// ffmpeg assemble them at CRF 18. See docs/architecture/recording.md.

export interface Screencast {
  stop(): Promise<CapturedFrames>;
}

export interface CapturedFrames {
  dir: string;
  files: string[]; // frame file names in capture order
  timestampsMs: number[]; // epoch ms per frame (CDP metadata.timestamp * 1000)
  endMs: number; // epoch ms when capture stopped
}

export async function startScreencast(page: Page, framesDir: string, log: Logger): Promise<Screencast> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const files: string[] = [];
  const timestampsMs: number[] = [];
  const pendingWrites: Promise<void>[] = [];
  let firstWriteError: unknown;
  let index = 0;

  cdp.on("Page.screencastFrame", (frame: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
    const name = `f${String(index).padStart(6, "0")}.jpg`;
    index++;
    files.push(name);
    timestampsMs.push((frame.metadata.timestamp ?? Date.now() / 1000) * 1000);
    // Ack immediately so Chrome can produce the next frame; the disk write
    // happens off the critical path (each frame has its own file, so write
    // completion order doesn't matter). Write failures fail the job at stop().
    cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch((e) => {
      log.error("screencastFrameAck failed", String(e));
    });
    pendingWrites.push(
      writeFile(join(framesDir, name), Buffer.from(frame.data, "base64")).catch((e) => {
        firstWriteError ??= e;
      }),
    );
  });

  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 80,
    maxWidth: 1920,
    maxHeight: 1080,
    everyNthFrame: 1,
  });

  return {
    async stop() {
      const endMs = Date.now();
      await cdp.send("Page.stopScreencast").catch((e) => log.error("stopScreencast failed", String(e)));
      await cdp.detach().catch(() => {});
      await Promise.all(pendingWrites);
      if (firstWriteError) throw new Error(`screencast frame write failed: ${String(firstWriteError)}`);
      if (files.length === 0) throw new Error("screencast captured zero frames");
      log.info(`screencast captured ${files.length} frames`);
      return { dir: framesDir, files, timestampsMs, endMs };
    },
  };
}

// ffconcat playlist for variable-frame-rate assembly: each frame is shown until
// the next frame's timestamp; the last frame is held until endMs and repeated
// once (concat-demuxer convention so the final duration is honored). Pure —
// unit-tested in test/screencast.test.ts.
export function buildConcat(files: string[], timestampsMs: number[], endMs: number): string {
  if (files.length === 0 || files.length !== timestampsMs.length) {
    throw new Error(`buildConcat: ${files.length} files vs ${timestampsMs.length} timestamps`);
  }
  const lines = ["ffconcat version 1.0"];
  for (let i = 0; i < files.length; i++) {
    const next = i + 1 < files.length ? timestampsMs[i + 1] : endMs;
    const durSec = Math.max(next - timestampsMs[i], 1) / 1000;
    lines.push(`file '${files[i]}'`);
    lines.push(`duration ${durSec.toFixed(3)}`);
  }
  lines.push(`file '${files[files.length - 1]}'`);
  return lines.join("\n") + "\n";
}

// Default ceiling on any silent (no-narration) stretch of video, in ms. 500
// keeps the worst-case audible pause around a second once TTS clips' own
// leading/trailing padding is added on top.
export const MAX_SILENCE_GAP_MS = 500;

// A narration clip placed on the video timeline. offsetMs is relative to the
// first captured frame (video t=0); durationMs is the clip's spoken length.
export interface AudioClip {
  offsetMs: number;
  durationMs: number;
}

export interface CompressedTimeline {
  files: string[]; // surviving frames in order
  timestampsMs: number[]; // epoch ms per surviving frame, shifted left by cuts
  endMs: number; // capture-stop epoch ms, shifted left by cuts
  clipOffsetsMs: number[]; // adjusted clip offsets, aligned 1:1 with the input clips
}

// Cut long silent stretches out of the video so it never freezes for seconds at
// a time (loading spinners after a goto, dead air between narration clips). Only
// *silent* video time — spans not covered by any narration clip, including
// before the first clip, between clips, and after the last — is removed, so the
// audio inside clips is never touched and A/V sync is preserved. For every
// silent gap longer than maxGapMs we keep its LAST maxGapMs: the most recent
// frames, i.e. the fully-loaded page, so the frame held right before narration
// resumes is never a stale spinner. Frames inside a removed span are dropped;
// all later frame timestamps and all later clip offsets shift left by the removed
// amount; endMs shrinks accordingly. Pure — unit-tested in test/screencast.test.ts.
export function compressSilence(
  files: string[],
  timestampsMs: number[],
  endMs: number,
  clips: AudioClip[],
  maxGapMs: number,
): CompressedTimeline {
  if (files.length !== timestampsMs.length) {
    throw new Error(`compressSilence: ${files.length} files vs ${timestampsMs.length} timestamps`);
  }
  if (files.length === 0) throw new Error("compressSilence: no frames");
  const videoStart = timestampsMs[0];

  // Clip coverage in epoch time.
  const clipIntervals = clips.map((c) => ({ start: videoStart + c.offsetMs, end: videoStart + c.offsetMs + c.durationMs }));
  // Sort + merge coverage so the gap math is robust even if clips were passed
  // out of order or happened to abut.
  const merged: { start: number; end: number }[] = [];
  for (const iv of [...clipIntervals].sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else merged.push({ ...iv });
  }

  // Silent gaps within [videoStart, endMs].
  const gaps: { start: number; end: number }[] = [];
  let cursor = videoStart;
  for (const iv of merged) {
    if (iv.start > cursor) gaps.push({ start: cursor, end: iv.start });
    cursor = Math.max(cursor, iv.end);
  }
  if (endMs > cursor) gaps.push({ start: cursor, end: endMs });

  // For each over-long gap, remove everything except its last maxGapMs.
  const removed: { start: number; end: number }[] = [];
  for (const g of gaps) {
    if (g.end - g.start > maxGapMs) removed.push({ start: g.start, end: g.end - maxGapMs });
  }
  if (removed.length === 0) {
    return { files: [...files], timestampsMs: [...timestampsMs], endMs, clipOffsetsMs: clips.map((c) => c.offsetMs) };
  }

  // Sanity: a removed span must never overlap a narration clip (would desync audio).
  for (const r of removed) {
    for (const iv of clipIntervals) {
      if (r.start < iv.end && iv.start < r.end) {
        throw new Error(`compressSilence: cut [${r.start},${r.end}) overlaps clip [${iv.start},${iv.end})`);
      }
    }
  }

  const removedBefore = (t: number): number => {
    let sum = 0;
    for (const r of removed) if (r.end <= t) sum += r.end - r.start;
    return sum;
  };
  const inRemoved = (t: number): boolean => removed.some((r) => t >= r.start && t < r.end);

  const newFiles: string[] = [];
  const newTimestamps: number[] = [];
  for (let i = 0; i < timestampsMs.length; i++) {
    const t = timestampsMs[i];
    if (inRemoved(t)) continue;
    newFiles.push(files[i]);
    newTimestamps.push(t - removedBefore(t));
  }
  if (newFiles.length === 0) throw new Error("compressSilence: every frame was cut");

  const totalRemoved = removed.reduce((a, r) => a + (r.end - r.start), 0);
  const newVideoStart = newTimestamps[0];
  const clipOffsetsMs = clipIntervals.map((iv) => iv.start - removedBefore(iv.start) - newVideoStart);

  return { files: newFiles, timestampsMs: newTimestamps, endMs: endMs - totalRemoved, clipOffsetsMs };
}
