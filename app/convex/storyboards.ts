import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { storyboardValidator } from "./lib/validators";

export const save = internalMutation({
  args: { runId: v.id("runs"), data: storyboardValidator },
  returns: v.id("storyboards"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("storyboards", args);
  },
});
