import { execFile } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { promisify } from "node:util";
import type { Logger } from "./log.js";

const execFileP = promisify(execFile);

// Resolve a binary: explicit env override, then the Homebrew paths used on this
// dev machine (ffmpeg-full first — the plain formula lacks libass, which the
// caption burn-in needs), then the bare name on PATH (how it resolves inside
// the container, where the Debian build includes libass).
function resolveBin(name: "ffmpeg" | "ffprobe"): string {
  const override = process.env[`${name.toUpperCase()}_PATH`];
  if (override) return override;
  const brewFull = `/opt/homebrew/opt/ffmpeg-full/bin/${name}`;
  if (existsSync(brewFull)) return brewFull;
  const brew = `/opt/homebrew/bin/${name}`;
  if (existsSync(brew)) return brew;
  return name;
}

const FFMPEG = resolveBin("ffmpeg");
const FFPROBE = resolveBin("ffprobe");

// Duration of a media file in milliseconds.
export async function probeDurationMs(path: string): Promise<number> {
  const { stdout } = await execFileP(FFPROBE, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "json",
    path,
  ]);
  const seconds = Number(JSON.parse(stdout).format?.duration);
  if (!Number.isFinite(seconds)) throw new Error(`ffprobe could not read duration of ${path}`);
  return Math.round(seconds * 1000);
}

// True if the file has at least one audio stream.
export async function hasAudioStream(path: string): Promise<boolean> {
  const { stdout } = await execFileP(FFPROBE, [
    "-v", "error",
    "-select_streams", "a",
    "-show_entries", "stream=index",
    "-of", "json",
    path,
  ]);
  return Array.isArray(JSON.parse(stdout).streams) && JSON.parse(stdout).streams.length > 0;
}

export interface AudioPlacement {
  path: string;
  offsetMs: number;
}

// Pitch-preserving speed-up of an audio file in place (atempo). Used to make
// TTS narration faster than the voice model's natural pace.
export async function speedUpAudio(path: string, tempo: number): Promise<void> {
  if (tempo === 1) return;
  const tmp = `${path}.tempo.mp3`;
  await execFileP(FFMPEG, ["-y", "-i", path, "-filter:a", `atempo=${tempo}`, tmp]);
  renameSync(tmp, path);
}

// libass ASS style overrides for burned-in captions: white text on a
// semi-transparent black box, bottom-centered. FontSize is in the libass
// default 288-line playfield, so 14 renders at ~52px on the 1080p frame.
const SUBTITLE_STYLE =
  "FontName=Arial,FontSize=14,PrimaryColour=&H00FFFFFF,OutlineColour=&H66000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=30";

// Escape a path for use as a quoted value inside an ffmpeg filtergraph.
function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:");
}

// Assemble the screencast JPEG frames (an ffconcat playlist with per-frame
// durations, i.e. variable frame rate from the CDP timestamps) into h264
// CRF 18 yuv420p + faststart, muxing narration clips at their measured offsets
// (adelay + amix, no normalization). The fps filter converts the VFR input to
// constant 30 fps (duplicated frames during static stretches are nearly free
// at encode time, and CFR plays back smoother than VFR in players/editors).
// When subtitlesPath is given, the SRT cues are burned into the frames via
// libass. ffmpeg does assembly and muxing only — zooms happen in-page.
export async function assembleAndMux(
  concatPath: string,
  audio: AudioPlacement[],
  outPath: string,
  log: Logger,
  subtitlesPath: string | undefined,
  size: { width: number; height: number },
): Promise<void> {
  const args = ["-y", "-f", "concat", "-safe", "0", "-i", concatPath];
  for (const a of audio) args.push("-i", a.path);

  const burnIn = subtitlesPath
    ? `,subtitles=filename='${escapeFilterPath(subtitlesPath)}':force_style='${SUBTITLE_STYLE}'`
    : "";
  const videoChain = `[0:v]fps=30,scale=${size.width}:${size.height},setsar=1,format=yuv420p${burnIn}[vout]`;
  if (audio.length > 0) {
    const filters: string[] = [videoChain];
    const labels: string[] = [];
    audio.forEach((a, i) => {
      const label = `d${i}`;
      // input 0 is the frame sequence; audio inputs start at 1
      filters.push(`[${i + 1}:a]adelay=${a.offsetMs}:all=1[${label}]`);
      labels.push(`[${label}]`);
    });
    filters.push(`${labels.join("")}amix=inputs=${audio.length}:normalize=0[aout]`);
    args.push(
      "-filter_complex", filters.join(";"),
      "-map", "[vout]", "-map", "[aout]",
      "-c:a", "aac", "-b:a", "192k",
    );
  } else {
    args.push("-filter_complex", videoChain, "-map", "[vout]");
  }

  args.push(
    "-c:v", "libx264",
    "-crf", "18",
    // veryfast cuts encode time 2-4x on container CPUs at this CRF for a
    // barely visible quality difference (somewhat larger file).
    "-preset", "veryfast",
    "-movflags", "+faststart",
    outPath,
  );

  log.info(`ffmpeg assemble+mux: ${audio.length} audio clip(s) -> ${outPath}`);
  try {
    await execFileP(FFMPEG, args, { maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    const err = e as { code?: number; stderr?: string };
    log.error(`ffmpeg exited ${err.code}`, (err.stderr || "").slice(-800));
    throw new Error(`ffmpeg assemble failed (exit ${err.code})`);
  }
  log.info(`ffmpeg assemble+mux done: ${outPath}`);
}
