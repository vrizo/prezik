import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { agentNameValidator, runEventLevelValidator } from "./validators";

export type NewRunEvent = {
  runId: Id<"runs">;
  agent: "scout" | "mapper" | "director" | "presenter";
  level: "info" | "error";
  message: string;
  url?: string;
  screenshotId?: Id<"_storage">;
  sceneId?: string;
};

// The single place that appends run_events, so `seq` always increments
// correctly no matter which agent or HTTP callback is writing.
export async function appendEventDb(ctx: MutationCtx, event: NewRunEvent): Promise<number> {
  const last = await ctx.db
    .query("run_events")
    .withIndex("by_run", (q) => q.eq("runId", event.runId))
    .order("desc")
    .first();
  const seq = (last?.seq ?? 0) + 1;
  await ctx.db.insert("run_events", { ...event, seq });
  return seq;
}

// Callable via ctx.runMutation(internal["lib/events"].append, ...) from
// actions and HTTP actions, which have no direct db access.
export const append = internalMutation({
  args: {
    runId: v.id("runs"),
    agent: agentNameValidator,
    level: runEventLevelValidator,
    message: v.string(),
    url: v.optional(v.string()),
    screenshotId: v.optional(v.id("_storage")),
    sceneId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await appendEventDb(ctx, args);
    return null;
  },
});
