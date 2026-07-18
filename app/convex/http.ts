import { httpRouter } from "convex/server";
import { z } from "zod";
import { RecorderCallback, RunOptions } from "@prezik/shared";
import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { sha256Hex } from "./lib/crypto";
import { json, preflight } from "./lib/cors";
import { errorMessage } from "./lib/errors";

const http = httpRouter();

// Matches the UI's own defaults (see src/features/start).
const DEFAULT_RUN_OPTIONS: RunOptions = {
  voice: "neutral",
  zoom: true,
  length: "short",
  captions: true,
  credentials: { mode: "none" },
};

function segmentsAfter(pathname: string, prefix: string): string[] {
  return pathname.slice(prefix.length).split("/").filter(Boolean);
}

type AuthResult = { ok: true; token: string } | { ok: false };

// Bearer <runToken>, sha256-compared against the run's stored hash. Never
// compares against a plaintext token — none is ever stored.
async function authenticateRun(ctx: ActionCtx, request: Request, runId: Id<"runs">): Promise<AuthResult> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return { ok: false };
  const auth = await ctx.runQuery(internal.runs.getAuthInternal, { runId });
  if (!auth) return { ok: false };
  const hash = await sha256Hex(token);
  if (hash !== auth.runTokenHash) return { ok: false };
  return { ok: true, token };
}

// ---------------------------------------------------------------------------
// Recorder -> Convex callbacks. Not part of the public API.
// ---------------------------------------------------------------------------

http.route({
  pathPrefix: "/callbacks/runs/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const { pathname } = new URL(request.url);
    const [runIdStr, sub, ...rest] = segmentsAfter(pathname, "/callbacks/runs/");
    if (!runIdStr || rest.length > 0 || (sub && sub !== "screenshot")) {
      return new Response("not found", { status: 404 });
    }
    const runId = runIdStr as Id<"runs">;

    const auth = await authenticateRun(ctx, request, runId);
    if (!auth.ok) return json({ error: "invalid or missing bearer token" }, 401);

    if (sub === "screenshot") {
      const blob = await request.blob();
      const screenshotId = await ctx.storage.store(blob);
      return json({ screenshotId });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }
    const parsed = RecorderCallback.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.message }, 400);
    const cb = parsed.data;

    switch (cb.kind) {
      case "event": {
        const e = cb.event;
        await ctx.runMutation(internal.lib.events.append, {
          runId,
          agent: e.agent,
          level: e.level,
          message: e.message,
          url: e.url,
          screenshotId: e.screenshotId ? (e.screenshotId as Id<"_storage">) : undefined,
          sceneId: e.sceneId,
        });
        break;
      }
      case "page": {
        const p = cb.page;
        await ctx.runMutation(internal.sitePages.insert, {
          runId,
          url: p.url,
          title: p.title,
          purpose: p.purpose,
          screenshotId: p.screenshotId ? (p.screenshotId as Id<"_storage">) : undefined,
          linksTo: p.linksTo,
          elements: p.elements,
        });
        break;
      }
      case "credentials":
        await ctx.runMutation(internal.runs.setCredentialsUsed, {
          runId,
          email: cb.email,
          password: cb.password,
        });
        break;
      case "mapDone":
        await ctx.runMutation(internal.runs.markPlanning, { runId });
        await ctx.runMutation(internal.lib.events.append, {
          runId,
          agent: "mapper",
          level: "info",
          message: `mapping done: ${cb.pageCount} pages found`,
        });
        // Forward the same bearer token the recorder just authenticated
        // with — it is never persisted in plain form, only threaded
        // through action/scheduler arguments like this.
        await ctx.scheduler.runAfter(0, internal.agents.director.run, { runId, runToken: auth.token });
        break;
      case "sceneDone":
        await ctx.runMutation(internal.lib.events.append, {
          runId,
          agent: "presenter",
          level: "info",
          message: "scene done",
          sceneId: cb.sceneId,
        });
        break;
      case "videoReady":
        await ctx.runMutation(internal.runs.markDone, {
          runId,
          playbackUrl: cb.playbackUrl,
          captionsUrl: cb.captionsUrl,
          durationSec: cb.durationSec,
        });
        break;
      case "recorderFailed":
        await ctx.runMutation(internal.runs.failInternal, { runId, agent: "presenter", message: cb.error });
        break;
    }
    return json({ ok: true });
  }),
});

// ---------------------------------------------------------------------------
// Public API. Keep in sync with docs/api/http.md and public/openapi.json.
// ---------------------------------------------------------------------------

const CreateRunBody = z.object({
  url: z.string().min(1),
  options: RunOptions.optional(),
  sessionId: z.string().optional(),
});

http.route({
  path: "/api/runs",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }
    const parsed = CreateRunBody.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.message }, 400);
    const { url, options, sessionId: sessionIdArg } = parsed.data;

    let sessionId: Id<"sessions">;
    if (sessionIdArg) {
      sessionId = sessionIdArg as Id<"sessions">;
    } else {
      // No session supplied over raw HTTP: mint a fresh anonymous one.
      try {
        const session = await ctx.runMutation(api.sessions.getOrCreate, { anonId: crypto.randomUUID() });
        sessionId = session.sessionId;
      } catch (err) {
        const message = errorMessage(err);
        return json({ error: message }, 400);
      }
    }

    try {
      const { runId, runToken } = await ctx.runMutation(api.runs.create, {
        url,
        options: options ?? DEFAULT_RUN_OPTIONS,
        sessionId,
      });
      return json({ runId, sessionId, runToken });
    } catch (err) {
      const message = errorMessage(err);
      // Include sessionId even on failure (e.g. "not enough credits") so
      // the caller can redeem a coupon against it and retry, instead of
      // minting a fresh zero-credit session every time.
      return json({ error: message, sessionId }, 400);
    }
  }),
});

http.route({ path: "/api/runs", method: "OPTIONS", handler: httpAction(async () => preflight()) });

http.route({
  pathPrefix: "/api/runs/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const { pathname, searchParams } = new URL(request.url);
    const [idStr, sub, ...rest] = segmentsAfter(pathname, "/api/runs/");
    if (!idStr || rest.length > 0 || (sub && sub !== "events")) return json({ error: "not found" }, 404);
    const runId = idStr as Id<"runs">;

    if (sub === "events") {
      const afterParam = searchParams.get("after");
      const after = afterParam ? Number(afterParam) : undefined;
      if (afterParam !== null && Number.isNaN(after)) return json({ error: "after must be a number" }, 400);
      const events = await ctx.runQuery(api.runs.events, { runId, after });
      return json({ events });
    }

    const run = await ctx.runQuery(api.runs.get, { runId });
    if (!run) return json({ error: "run not found" }, 404);
    // playbackUrl / captionsUrl / durationSec live directly on the run doc
    // (plain URLs served by the recorder Worker from R2).
    return json(run);
  }),
});

http.route({ pathPrefix: "/api/runs/", method: "OPTIONS", handler: httpAction(async () => preflight()) });

const CouponBody = z.object({ code: z.string().min(1) });

http.route({
  pathPrefix: "/api/sessions/",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const { pathname } = new URL(request.url);
    const [idStr, sub, ...rest] = segmentsAfter(pathname, "/api/sessions/");
    if (!idStr || sub !== "coupon" || rest.length > 0) return json({ error: "not found" }, 404);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }
    const parsed = CouponBody.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.message }, 400);

    try {
      const result = await ctx.runMutation(api.sessions.redeemCoupon, {
        sessionId: idStr as Id<"sessions">,
        code: parsed.data.code,
      });
      return json(result);
    } catch (err) {
      const message = errorMessage(err);
      return json({ error: message }, 400);
    }
  }),
});

http.route({ pathPrefix: "/api/sessions/", method: "OPTIONS", handler: httpAction(async () => preflight()) });

export default http;
