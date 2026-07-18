import { v } from "convex/values";
import { query } from "./_generated/server";

// Recent captured frames for the Record step's filmstrip: the last events
// that carry a screenshot, resolved to storage URLs, oldest first.
export const list = query({
  args: { runId: v.id("runs"), limit: v.optional(v.number()) },
  handler: async (ctx, { runId, limit }) => {
    const max = Math.min(limit ?? 8, 20);
    const events = await ctx.db
      .query("run_events")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .order("desc")
      .take(300);
    const withShots = events.filter((e) => e.screenshotId).slice(0, max).reverse();
    const frames = [];
    for (const e of withShots) {
      const url = await ctx.storage.getUrl(e.screenshotId!);
      if (url) frames.push({ seq: e.seq, url, sceneId: e.sceneId ?? null, pageUrl: e.url ?? null });
    }
    return frames;
  },
});
