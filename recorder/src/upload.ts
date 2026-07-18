import { readFile } from "node:fs/promises";
import { requireEnv } from "./env.js";
import type { Logger } from "./log.js";

export interface UploadResult {
  playbackUrl: string;
  captionsUrl?: string;
}

// Hand the finished mp4 (and VTT when captions are on) to the recorder's own
// Worker, which writes them to the R2 bucket binding and serves them at
// /videos/<key>. No video service subscription involved.
export async function uploadToWorker(
  mp4Path: string,
  captionsVtt: string | undefined,
  runId: string,
  log: Logger,
): Promise<UploadResult> {
  const base = requireEnv("WORKER_PUBLIC_URL").replace(/\/+$/, "");
  const token = requireEnv("RECORDER_SERVICE_TOKEN");

  const put = async (key: string, body: Buffer | string, contentType: string) => {
    const res = await fetch(`${base}/internal/videos/${key}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": contentType },
      body: body as unknown as BodyInit, // Node fetch accepts Buffer; DOM BodyInit does not
    });
    if (!res.ok) {
      throw new Error(`upload of ${key} failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
    log.info(`uploaded ${key} (${typeof body === "string" ? body.length : body.byteLength} bytes)`);
  };

  await put(`${runId}.mp4`, await readFile(mp4Path), "video/mp4");
  const result: UploadResult = { playbackUrl: `${base}/videos/${runId}.mp4` };

  if (captionsVtt) {
    await put(`${runId}.vtt`, captionsVtt, "text/vtt");
    result.captionsUrl = `${base}/videos/${runId}.vtt`;
  }
  return result;
}
