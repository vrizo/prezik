import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { planProgressSceneValidator } from "./lib/validators";

// One row per run, written by the Director as it streams the plan. The Plan
// view subscribes to `get` while the run is planning.

export const upsert = internalMutation({
  args: {
    runId: v.id("runs"),
    thinking: v.string(),
    thinkingDone: v.boolean(),
    scenes: v.array(planProgressSceneValidator),
  },
  returns: v.null(),
  handler: async (ctx, { runId, thinking, thinkingDone, scenes }) => {
    const existing = await ctx.db
      .query("plan_progress")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { thinking, thinkingDone, scenes });
    } else {
      await ctx.db.insert("plan_progress", { runId, thinking, thinkingDone, scenes });
    }
    return null;
  },
});

export const clear = internalMutation({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const existing = await ctx.db
      .query("plan_progress")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

export const get = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    return await ctx.db
      .query("plan_progress")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .first();
  },
});
