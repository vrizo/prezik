import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { pageElementValidator } from "./lib/validators";

// Written from the recorder's "page" callback (map mode). Read back by the
// Director to write the storyboard.
export const insert = internalMutation({
  args: {
    runId: v.id("runs"),
    url: v.string(),
    title: v.string(),
    purpose: v.string(),
    screenshotId: v.optional(v.id("_storage")),
    linksTo: v.array(v.string()),
    elements: v.array(pageElementValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("site_pages", args);
    return null;
  },
});

// Live "Discovered pages" table on the Explore step. Elements are omitted —
// the UI only shows url/title/purpose; linksTo feeds the "~N pages" estimate.
export const list = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    const pages = await ctx.db
      .query("site_pages")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
    return pages.map((p) => ({
      url: p.url,
      title: p.title,
      purpose: p.purpose,
      linksTo: p.linksTo,
    }));
  },
});

export const listInternal = internalQuery({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    return await ctx.db
      .query("site_pages")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect();
  },
});
