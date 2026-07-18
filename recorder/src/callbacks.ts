import type { RecorderCallback } from "@prezik/shared";
import type { Logger } from "./log.js";

// Sink for recorder callbacks. The server posts them to Convex; the dev CLI
// logs them. Screenshot upload returns a screenshotId (or null if it failed).
export interface Emitter {
  emit(cb: RecorderCallback): Promise<void>;
  uploadScreenshot(jpeg: Buffer): Promise<string | null>;
}

// Posts every callback to `${callbackUrl}` (Bearer runToken) and screenshots to
// `${callbackUrl}/screenshot`. Callback failures are logged, not thrown: one
// dropped progress update must not kill the job. The job's own fatal error is
// reported separately via a recorderFailed callback by the caller.
export function httpEmitter(callbackUrl: string, runToken: string, log: Logger): Emitter {
  const auth = `Bearer ${runToken}`;
  return {
    async emit(cb) {
      try {
        const res = await fetch(callbackUrl, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: auth },
          body: JSON.stringify(cb),
        });
        if (!res.ok) log.error(`callback ${cb.kind} rejected: HTTP ${res.status}`);
      } catch (e) {
        log.error(`callback ${cb.kind} network error`, String(e));
      }
    },
    async uploadScreenshot(jpeg) {
      try {
        const res = await fetch(`${callbackUrl}/screenshot`, {
          method: "POST",
          headers: { "content-type": "image/jpeg", authorization: auth },
          // Node's fetch accepts a Buffer body; the DOM BodyInit type does not.
          body: jpeg as unknown as BodyInit,
        });
        if (!res.ok) {
          log.error(`screenshot upload rejected: HTTP ${res.status}`);
          return null;
        }
        const j = (await res.json()) as { screenshotId: string };
        return j.screenshotId;
      } catch (e) {
        log.error("screenshot upload network error", String(e));
        return null;
      }
    },
  };
}
