import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Storyboard } from "@prezik/shared";
import type { RecorderCallback } from "@prezik/shared";
import type { Emitter } from "./callbacks.js";
import { makeLogger } from "./log.js";
import { runRecording } from "./record.js";
import type { RecordOptions } from "./types.js";
import { uploadToWorker } from "./upload.js";

// tsx src/cli.ts --storyboard <file> --out <dir> [--no-tts] [--no-upload] [--vertical]
function parseArgs(argv: string[]) {
  const args: { storyboard?: string; out?: string; noTts: boolean; noUpload: boolean; vertical: boolean } = {
    noTts: false,
    noUpload: false,
    vertical: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--storyboard") args.storyboard = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--no-tts") args.noTts = true;
    else if (a === "--no-upload") args.noUpload = true;
    else if (a === "--vertical") args.vertical = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.storyboard) throw new Error("--storyboard <file> is required");
  if (!args.out) throw new Error("--out <dir> is required");
  return args as { storyboard: string; out: string; noTts: boolean; noUpload: boolean; vertical: boolean };
}

// The CLI is a local harness: callbacks are logged, not posted.
function loggingEmitter(log: ReturnType<typeof makeLogger>): Emitter {
  return {
    async emit(cb: RecorderCallback) {
      log.info(`callback ${cb.kind}`, cb);
    },
    async uploadScreenshot() {
      return null;
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const log = makeLogger();

  const storyboard = Storyboard.parse(JSON.parse(readFileSync(resolve(args.storyboard), "utf8")));
  const options: RecordOptions = {
    voice: "neutral",
    zoom: true,
    captions: true,
    format: args.vertical ? "vertical" : "horizontal",
  };
  const outDir = resolve(args.out);

  if (args.noTts) {
    log.error("WARNING: --no-tts set. Rendering SILENT video with 4s per segment. This is not a real demo.");
    console.error("\n*** --no-tts: SILENT render, 4s per segment (explicit flag) ***\n");
  }

  const result = await runRecording({
    runId: "demo",
    storyboard,
    options,
    outDir,
    tts: !args.noTts,
    emit: loggingEmitter(log),
    log,
  });

  if (result.captionsVtt) {
    const vttPath = resolve(outDir, "demo.vtt");
    writeFileSync(vttPath, result.captionsVtt);
    log.info(`captions written: ${vttPath}`);
  }

  log.info(`video: ${result.mp4Path} (${result.durationSec}s)`);
  console.log(`\nMP4: ${result.mp4Path}\nDuration: ${result.durationSec}s`);

  if (args.noUpload) {
    console.log("--no-upload: kept local, not uploading.");
    return;
  }
  const upload = await uploadToWorker(result.mp4Path, result.captionsVtt, "demo", log);
  console.log(`Playback: ${upload.playbackUrl}${upload.captionsUrl ? `\nCaptions: ${upload.captionsUrl}` : ""}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack || e.message : String(e));
  process.exit(1);
});
