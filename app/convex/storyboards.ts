import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { storyboardValidator } from "./lib/validators";

export const save = internalMutation({
  args: { runId: v.id("runs"), data: storyboardValidator },
  returns: v.id("storyboards"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("storyboards", args);
  },
});

// The Plan step renders the storyboard read-only as soon as the Director
// saves it.
export const get = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    const doc = await ctx.db
      .query("storyboards")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .first();
    return doc ? doc.data : null;
  },
});
