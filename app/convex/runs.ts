import { v, ConvexError } from "convex/values";
import type { Infer } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { agentNameValidator, GUIDANCE_MAX_LENGTH, runOptionsValidator } from "./lib/validators";
import { randomToken, sha256Hex } from "./lib/crypto";
import { appendEventDb } from "./lib/events";

type RunOptionsArg = Infer<typeof runOptionsValidator>;

// Shared by `create` and `rerecord`: checks entitlement, mints a run token
// (stored only as a hash), inserts the run, and schedules Scout + Mapper.
// Recording itself only starts once Director hands off to the recorder
// (see markRecording), which is also when the credit is spent.
async function startRun(
  ctx: MutationCtx,
  args: { url: string; options: RunOptionsArg; sessionId: Id<"sessions"> },
): Promise<{ runId: Id<"runs">; runToken: string }> {
  const session = await ctx.db.get(args.sessionId);
  if (!session) throw new ConvexError("session not found");
  if (session.credits < 1) {
    throw new ConvexError("not enough credits — redeem a coupon or add credits before starting a run");
  }
  if ((args.options.guidance?.length ?? 0) > GUIDANCE_MAX_LENGTH) {
    throw new ConvexError(`guidance must be ${GUIDANCE_MAX_LENGTH} characters or fewer`);
  }

  const runToken = randomToken(32);
  const runTokenHash = await sha256Hex(runToken);

  const runId = await ctx.db.insert("runs", {
    sessionId: args.sessionId,
    url: args.url,
    options: args.options,
    status: "created",
    runTokenHash,
    guidance: args.options.guidance,
  });

  await ctx.scheduler.runAfter(0, internal.agents.scout.run, { runId });
  await ctx.scheduler.runAfter(0, internal.agents.mapper.run, {
    runId,
    runToken,
    url: args.url,
    credentials: args.options.credentials,
    format: args.options.format ?? "horizontal",
  });

  return { runId, runToken };
}

export const create = mutation({
  args: { url: v.string(), options: runOptionsValidator, sessionId: v.id("sessions") },
  returns: v.object({ runId: v.id("runs"), runToken: v.string() }),
  handler: async (ctx, args) => startRun(ctx, args),
});

// New run copying url + options from an existing one (Re-record button).
export const rerecord = mutation({
  args: { runId: v.id("runs") },
  returns: v.object({ runId: v.id("runs"), runToken: v.string() }),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run) throw new ConvexError("run not found");
    return startRun(ctx, { url: run.url, options: run.options, sessionId: run.sessionId });
  },
});

// Public run doc. Strips runTokenHash — that's bearer-auth material with no
// legitimate client use.
export const get = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run) return null;
    const { runTokenHash: _runTokenHash, ...rest } = run;
    return rest;
  },
});

// Live feed, paginated by seq. Also used directly by GET /api/runs/:id/events.
export const events = query({
  args: { runId: v.id("runs"), after: v.optional(v.number()) },
  handler: async (ctx, { runId, after }) => {
    return await ctx.db
      .query("run_events")
      .withIndex("by_run", (q) => q.eq("runId", runId).gt("seq", after ?? 0))
      .order("asc")
      .take(300);
  },
});

// Most recent event that carries a screenshot, resolved to a fetchable URL.
export const latestScreenshot = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    const recent = await ctx.db
      .query("run_events")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .order("desc")
      .take(100);
    const withShot = recent.find((e) => e.screenshotId);
    if (!withShot?.screenshotId) return null;
    const url = await ctx.storage.getUrl(withShot.screenshotId);
    if (!url) return null;
    return { url, seq: withShot.seq };
  },
});

export const setGuidance = mutation({
  args: { runId: v.id("runs"), guidance: v.string() },
  returns: v.null(),
  handler: async (ctx, { runId, guidance }) => {
    if (guidance.length > GUIDANCE_MAX_LENGTH) {
      throw new ConvexError(`guidance must be ${GUIDANCE_MAX_LENGTH} characters or fewer`);
    }
    await ctx.db.patch(runId, { guidance });
    return null;
  },
});

// --- internal: read for auth only (the one place runTokenHash leaves the db) ---
export const getAuthInternal = internalQuery({
  args: { runId: v.id("runs") },
  returns: v.union(v.object({ runTokenHash: v.string() }), v.null()),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    return run ? { runTokenHash: run.runTokenHash } : null;
  },
});

// --- internal: status transitions, one per transition, called by agents/http ---

export const markExploring = internalMutation({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run) throw new Error("run not found");
    if (run.status === "created") await ctx.db.patch(runId, { status: "exploring" });
    return null;
  },
});

// Agents run as independent scheduled actions, so a later success can race
// a earlier failure (e.g. Scout fails while Mapper is still crawling —
// Mapper's mapDone callback must not resurrect the run). Every forward
// transition past "created" therefore no-ops once status is already
// "failed".
export const markPlanning = internalMutation({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run) throw new Error("run not found");
    if (run.status === "failed") return null;
    await ctx.db.patch(runId, { status: "planning" });
    return null;
  },
});

// Director found the product is behind sign-in and no credentials were
// given: stop the run here, terminally, so the UI can ask the user to start
// over with test credentials. No credit is spent (the recorder never runs).
export const markNeedsCredentials = internalMutation({
  args: { runId: v.id("runs"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, { runId, reason }) => {
    const run = await ctx.db.get(runId);
    if (!run) throw new Error("run not found");
    if (run.status === "failed") return null;
    await ctx.db.patch(runId, { status: "needs_credentials", needsCredentialsReason: reason });
    await appendEventDb(ctx, {
      runId,
      agent: "director",
      level: "info",
      message: `this product requires sign-in — start a new run with test credentials (${reason})`,
    });
    return null;
  },
});

// Status -> recording AND the credit reservation is spent here, exactly
// once, only when the recorder has actually accepted the job.
export const markRecording = internalMutation({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run) throw new Error("run not found");
    if (run.status === "failed") return null;
    await ctx.db.patch(runId, { status: "recording" });
    const session = await ctx.db.get(run.sessionId);
    if (!session) throw new Error("session not found");
    await ctx.db.patch(session._id, { credits: Math.max(0, session.credits - 1) });
    return null;
  },
});

export const markDone = internalMutation({
  args: {
    runId: v.id("runs"),
    playbackUrl: v.string(),
    captionsUrl: v.optional(v.string()),
    durationSec: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("run not found");
    if (run.status === "failed") return null;
    await ctx.db.patch(args.runId, {
      status: "done",
      playbackUrl: args.playbackUrl,
      captionsUrl: args.captionsUrl,
      durationSec: args.durationSec,
    });
    return null;
  },
});

export const setBrief = internalMutation({
  args: { runId: v.id("runs"), brief: v.string() },
  returns: v.null(),
  handler: async (ctx, { runId, brief }) => {
    await ctx.db.patch(runId, { brief });
    return null;
  },
});

export const setCredentialsUsed = internalMutation({
  args: { runId: v.id("runs"), email: v.string(), password: v.string() },
  returns: v.null(),
  handler: async (ctx, { runId, email, password }) => {
    await ctx.db.patch(runId, { credentialsUsed: { email, password } });
    return null;
  },
});

// Any agent failure lands here: status -> failed, error set, and a matching
// error event so the feed shows it too. No silent recovery.
export const failInternal = internalMutation({
  args: { runId: v.id("runs"), agent: agentNameValidator, message: v.string() },
  returns: v.null(),
  handler: async (ctx, { runId, agent, message }) => {
    const run = await ctx.db.get(runId);
    if (!run) return null;
    await ctx.db.patch(runId, { status: "failed", error: message });
    await appendEventDb(ctx, { runId, agent, level: "error", message });
    return null;
  },
});
