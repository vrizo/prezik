import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
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
    format: v.union(v.literal("horizontal"), v.literal("vertical")),
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

      // Each run gets a fresh container instance (the Worker routes by runId),
      // so the instance is always cold here. A straight POST /map can die with
      // a connect/tunnel error while the container boots. Poll /healthz on the
      // same runId first — the GET boots the instance and is harmless to
      // retry — then POST /map exactly once.
      await waitForRecorder(ctx, args.runId, recorderUrl);

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
          format: args.format,
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

// Boot the run's container instance and wait until it answers. Retries only
// cover the boot window; if the container still isn't up after the deadline,
// the error propagates and fails the run.
async function waitForRecorder(ctx: ActionCtx, runId: Id<"runs">, recorderUrl: string): Promise<void> {
  const deadline = Date.now() + 120_000;
  let lastError = "";
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${recorderUrl}/healthz?runId=${runId}`);
      if (res.ok) return;
      lastError = `recorder /healthz returned ${res.status}`;
    } catch (err) {
      lastError = errorMessage(err);
    }
    if (Date.now() >= deadline) {
      throw new Error(`recorder container did not come up within 120s: ${lastError}`);
    }
    if (attempt === 0) {
      await ctx.runMutation(internal.lib.events.append, {
        runId,
        agent: "mapper",
        level: "info",
        message: "recorder container is booting — waiting for it to come up",
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
