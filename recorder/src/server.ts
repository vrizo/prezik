import http from "node:http";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { httpEmitter } from "./callbacks.js";
import { containerDiagnostics } from "./diag.js";
import { RECORDER_DIR, requireEnv } from "./env.js";
import { makeLogger } from "./log.js";
import { runMap } from "./map.js";
import { runRecording } from "./record.js";
import { MapRequest, RecordRequest } from "./types.js";
import { uploadToWorker } from "./upload.js";

const log = makeLogger();
const PORT = Number(process.env.PORT || 8080);

function buildStamp(): string {
  return statSync(fileURLToPath(import.meta.url)).mtime.toISOString();
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(json);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// Map job: crawl and callback. A fatal error is reported as recorderFailed.
async function mapJob(req: MapRequest): Promise<void> {
  const emit = httpEmitter(req.callbackUrl, req.runToken, log);
  try {
    await runMap(req, emit, log);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const diag = containerDiagnostics();
    log.error(`map job ${req.runId} failed`, { message, diag });
    await emit.emit({ kind: "recorderFailed", error: `${message} [${diag}]` });
  }
}

// Record job: render, mux, upload, then videoReady. Fatal error -> recorderFailed.
async function recordJob(req: RecordRequest): Promise<void> {
  const emit = httpEmitter(req.callbackUrl, req.runToken, log);
  try {
    const result = await runRecording({
      runId: req.runId,
      storyboard: req.storyboard,
      options: req.options,
      credentials: req.credentials,
      outDir: join(RECORDER_DIR, "tmp", req.runId),
      tts: true,
      emit,
      log,
    });
    const upload = await uploadToWorker(result.mp4Path, result.captionsVtt, req.runId, log);
    await emit.emit({
      kind: "videoReady",
      playbackUrl: upload.playbackUrl,
      captionsUrl: upload.captionsUrl,
      durationSec: result.durationSec,
    });
    log.info(`record job ${req.runId} done: ${upload.playbackUrl} (${result.durationSec}s)`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Diagnostics answer "why did the browser die" (OOM kill count, memory
    // peak/limit, free disk) directly in the run's error.
    const diag = containerDiagnostics();
    log.error(`record job ${req.runId} failed`, { message, diag });
    await emit.emit({ kind: "recorderFailed", error: `${message} [${diag}]` });
  }
}

const server = http.createServer(async (req, res) => {
  // Route on the pathname only — callers append ?runId=<id> for the Worker's
  // per-run container routing, and that query string reaches us untouched.
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;

  if (req.method === "GET" && pathname === "/healthz") {
    // build = mtime of this compiled file inside the image, i.e. when the
    // image was built. Lets deploy scripts probe whether a container instance
    // is already on the new image instead of blind-waiting for the rollout.
    send(res, 200, { ok: true, build: buildStamp() });
    return;
  }

  if (req.method === "POST" && (pathname === "/map" || pathname === "/record")) {
    const token = requireEnv("RECORDER_SERVICE_TOKEN");
    if (req.headers.authorization !== `Bearer ${token}`) {
      send(res, 401, { error: "unauthorized" });
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readBody(req));
    } catch {
      send(res, 400, { error: "invalid JSON body" });
      return;
    }

    if (pathname === "/map") {
      const r = MapRequest.safeParse(parsed);
      if (!r.success) {
        send(res, 400, { error: "invalid /map body", issues: r.error.issues });
        return;
      }
      send(res, 202, { accepted: true, runId: r.data.runId });
      void mapJob(r.data);
    } else {
      const r = RecordRequest.safeParse(parsed);
      if (!r.success) {
        send(res, 400, { error: "invalid /record body", issues: r.error.issues });
        return;
      }
      send(res, 202, { accepted: true, runId: r.data.runId });
      void recordJob(r.data);
    }
    return;
  }

  send(res, 404, { error: "not found" });
});

server.listen(PORT, () => log.info(`recorder listening on :${PORT}`));
