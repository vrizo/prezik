import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { credentialsValidator } from "../lib/validators";
import { errorMessage } from "../lib/errors";

// Mapper: hands the run off to the recorder service's /map endpoint, which
// crawls the site with a real browser (signing up/logging in if
// credentials are set) and reports pages + screenshots back via HTTP
// callbacks. This action itself just makes the request; all the resulting
// state changes happen in convex/http.ts.
export const run = internalAction({
  args: {
    runId: v.id("runs"),
    runToken: v.string(),
    url: v.string(),
    credentials: credentialsValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(internal.runs.markExploring, { runId: args.runId });

      const recorderUrl = process.env.RECORDER_URL;
      if (!recorderUrl) throw new Error("RECORDER_URL is not set — cannot reach the recorder service");
      const serviceToken = process.env.RECORDER_SERVICE_TOKEN;
      if (!serviceToken) throw new Error("RECORDER_SERVICE_TOKEN is not set");
      const siteUrl = process.env.CONVEX_SITE_URL;
      if (!siteUrl) throw new Error("CONVEX_SITE_URL is not set");

      await ctx.runMutation(internal.lib.events.append, {
        runId: args.runId,
        agent: "mapper",
        level: "info",
        message: "asked the browser to start crawling",
        url: args.url,
      });

      // runId in the query string: the recorder Worker routes on it so a run's
      // /map and /record land on the same container instance (body isn't read
      // by the Worker's router).
      const res = await fetch(`${recorderUrl}/map?runId=${args.runId}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${serviceToken}` },
        body: JSON.stringify({
          runId: args.runId,
          callbackUrl: `${siteUrl}/callbacks/runs/${args.runId}`,
          runToken: args.runToken,
          url: args.url,
          credentials: args.credentials,
        }),
      });
      if (!res.ok) throw new Error(`recorder /map failed: ${res.status} ${await res.text()}`);
      return null;
    } catch (err) {
      const message = errorMessage(err);
      await ctx.runMutation(internal.runs.failInternal, { runId: args.runId, agent: "mapper", message });
      throw err;
    }
  },
});
