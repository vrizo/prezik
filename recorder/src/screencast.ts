import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CDPSession, Page } from "playwright";
import type { Logger } from "./log.js";

// Our own CDP screencast instead of Playwright's recordVideo. recordVideo
// re-encodes the same screencast to VP8 at a fixed low bitrate, which looks
// muddy; we keep the JPEG frames (quality 90) with their timestamps and let
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
  let index = 0;

  cdp.on("Page.screencastFrame", (frame: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
    const name = `f${String(index).padStart(6, "0")}.jpg`;
    index++;
    // Sync write keeps frame order and finishes before the ack (backpressure:
    // Chrome sends the next frame only after we acknowledge this one).
    writeFileSync(join(framesDir, name), Buffer.from(frame.data, "base64"));
    files.push(name);
    timestampsMs.push((frame.metadata.timestamp ?? Date.now() / 1000) * 1000);
    cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch((e) => {
      log.error("screencastFrameAck failed", String(e));
    });
  });

  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 90,
    maxWidth: 1920,
    maxHeight: 1080,
    everyNthFrame: 1,
  });

  return {
    async stop() {
      const endMs = Date.now();
      await cdp.send("Page.stopScreencast").catch((e) => log.error("stopScreencast failed", String(e)));
      await cdp.detach().catch(() => {});
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
