import { Container, getContainer } from "@cloudflare/containers";

// Cloudflare Worker in front of the recorder container. Three jobs:
// - forward /map, /record, /healthz to the container (a SQLite-backed DO),
// - accept finished videos from the container: PUT /internal/videos/<key> -> R2,
// - serve them publicly: GET /videos/<key> from R2 with Range support.
// Worker secrets/vars are NOT visible to the container unless forwarded via
// envVars below.

interface Env {
  RECORDER: DurableObjectNamespace;
  VIDEOS: R2Bucket;
  RECORDER_SERVICE_TOKEN: string;
  OPENAI_API_KEY: string;
  WORKER_PUBLIC_URL: string;
}

export class Recorder extends Container<Env> {
  defaultPort = 8080; // must match the Node server + Dockerfile EXPOSE
  sleepAfter = "20m"; // longer than the longest job so instances are not reaped mid-record

  envVars = {
    RECORDER_SERVICE_TOKEN: this.env.RECORDER_SERVICE_TOKEN,
    OPENAI_API_KEY: this.env.OPENAI_API_KEY,
    WORKER_PUBLIC_URL: this.env.WORKER_PUBLIC_URL,
  };

  override onStart(): void {
    console.log("recorder container started");
  }
  override onError(err: unknown): void {
    console.error("recorder container error", err);
  }
}

const KEY_RE = /^[A-Za-z0-9._-]+\.(mp4|vtt)$/;

function contentTypeFor(key: string): string {
  return key.endsWith(".vtt") ? "text/vtt" : "video/mp4";
}

async function putVideo(request: Request, env: Env, key: string): Promise<Response> {
  if (request.headers.get("authorization") !== `Bearer ${env.RECORDER_SERVICE_TOKEN}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!KEY_RE.test(key)) {
    return Response.json({ error: "invalid key, expected <name>.mp4 or <name>.vtt" }, { status: 400 });
  }
  await env.VIDEOS.put(key, request.body, { httpMetadata: { contentType: contentTypeFor(key) } });
  return Response.json({ ok: true, key });
}

async function getVideo(request: Request, env: Env, key: string): Promise<Response> {
  if (!KEY_RE.test(key)) return Response.json({ error: "invalid key" }, { status: 400 });

  const rangeHeader = request.headers.get("range");
  let range: R2Range | undefined;
  if (rangeHeader) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!m || (m[1] === "" && m[2] === "")) {
      return new Response("invalid Range", { status: 416 });
    }
    if (m[1] === "") range = { suffix: Number(m[2]) };
    else if (m[2] === "") range = { offset: Number(m[1]) };
    else range = { offset: Number(m[1]), length: Number(m[2]) - Number(m[1]) + 1 };
  }

  const object = await env.VIDEOS.get(key, range ? { range } : undefined);
  if (!object) return Response.json({ error: "not found" }, { status: 404 });

  const headers = new Headers({
    "content-type": contentTypeFor(key),
    "cache-control": "public, max-age=3600",
    "accept-ranges": "bytes",
    etag: object.httpEtag,
  });

  const r = object.range as { offset?: number; length?: number } | undefined;
  if (rangeHeader && r) {
    const offset = r.offset ?? Math.max(0, object.size - ((range as { suffix: number }).suffix ?? 0));
    const length = r.length ?? object.size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("content-length", String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("content-length", String(object.size));
  return new Response(object.body, { status: 200, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const internalMatch = /^\/internal\/videos\/([^/]+)$/.exec(url.pathname);
    if (internalMatch && request.method === "PUT") return putVideo(request, env, internalMatch[1]);

    const publicMatch = /^\/videos\/([^/]+)$/.exec(url.pathname);
    if (publicMatch && (request.method === "GET" || request.method === "HEAD")) {
      return getVideo(request, env, publicMatch[1]);
    }

    // Everything else goes to the container. Route by runId so a run's /map and
    // /record land on the same instance; /healthz uses a default instance.
    const runId = url.searchParams.get("runId") ?? "default";
    return getContainer(env.RECORDER, runId).fetch(request);
  },
} satisfies ExportedHandler<Env>;
