import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { errorMessage } from "../lib/errors";
import { runScout } from "./scoutCore";

// Scout: Tavily search + the site's own homepage, summarized into a short
// factual product brief. Runs in parallel with Mapper. The model-facing
// logic lives in scoutCore.ts, shared with the local training runner.
export const run = internalAction({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    try {
      await ctx.runMutation(internal.runs.markExploring, { runId });
      const run = await ctx.runQuery(api.runs.get, { runId });
      if (!run) throw new Error("run not found");

      const { brief } = await runScout(run.url, async (level, message, url) => {
        await ctx.runMutation(internal.lib.events.append, {
          runId,
          agent: "scout",
          level,
          message,
          ...(url ? { url } : {}),
        });
      });

      await ctx.runMutation(internal.runs.setBrief, { runId, brief });
      await ctx.runMutation(internal.lib.events.append, {
        runId,
        agent: "scout",
        level: "info",
        message: `brief ready: ${brief}`,
      });
      return null;
    } catch (err) {
      const message = errorMessage(err);
      await ctx.runMutation(internal.runs.failInternal, { runId, agent: "scout", message });
      throw err;
    }
  },
});
