import { v } from "convex/values";
import { LENGTH_TO_SCENES } from "@prezik/shared";
import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { errorMessage } from "../lib/errors";
import { generateStoryboard } from "./directorCore";

// Director: one strong-model call that turns the brief + sitemap into a
// Storyboard, then hands the storyboard to the recorder's /record endpoint.
// Runs after Mapper reports mapDone (scheduled from convex/http.ts). The
// model-facing logic (streaming, validation, retry) lives in
// directorCore.ts, shared with the local training runner.
export const run = internalAction({
  args: { runId: v.id("runs"), runToken: v.string() },
  returns: v.null(),
  handler: async (ctx, { runId, runToken }) => {
    try {
      const run = await ctx.runQuery(api.runs.get, { runId });
      if (!run) throw new Error("run not found");
      const pages = await ctx.runQuery(internal.sitePages.listInternal, { runId });

      await ctx.runMutation(internal.lib.events.append, {
        runId,
        agent: "director",
        level: "info",
        message: "writing the storyboard",
      });

      const { decision } = await generateStoryboard({
        url: run.url,
        brief: run.brief ?? "",
        pages,
        options: run.options,
        guidance: run.guidance,
        sceneRange: LENGTH_TO_SCENES[run.options.length],
        progress: {
          write: async ({ thinking, thinkingDone, scenes }) => {
            await ctx.runMutation(internal.planProgress.upsert, { runId, thinking, thinkingDone, scenes });
          },
          sceneDrafted: async (index, scene) => {
            await ctx.runMutation(internal.lib.events.append, {
              runId,
              agent: "director",
              level: "info",
              message: `scene ${index + 1} drafted: ${scene.title}`,
            });
          },
        },
      });

      // The product is behind a sign-in and no credentials were provided:
      // stop here without spending a credit and ask the user to start over
      // with test credentials. If credentials WERE provided, the Director
      // asking for them is a bug — fail loudly.
      if (decision.needsCredentials) {
        if (run.options.credentials.mode === "none") {
          await ctx.runMutation(internal.planProgress.clear, { runId });
          await ctx.runMutation(internal.runs.markNeedsCredentials, { runId, reason: decision.reason });
          return null;
        }
        throw new Error(`director requested credentials although credentials were provided: ${decision.reason}`);
      }

      const storyboard = decision.storyboard;
      if (!storyboard) throw new Error("director returned needsCredentials=false without a storyboard");

      await ctx.runMutation(internal.storyboards.save, { runId, data: storyboard });
      await ctx.runMutation(internal.planProgress.clear, { runId });
      await ctx.runMutation(internal.lib.events.append, {
        runId,
        agent: "director",
        level: "info",
        message: `storyboard ready: ${storyboard.scenes.map((s) => s.title).join(", ")}`,
      });

      const recorderUrl = process.env.RECORDER_URL;
      if (!recorderUrl) throw new Error("RECORDER_URL is not set — cannot reach the recorder service");
      const serviceToken = process.env.RECORDER_SERVICE_TOKEN;
      if (!serviceToken) throw new Error("RECORDER_SERVICE_TOKEN is not set");
      const siteUrl = process.env.CONVEX_SITE_URL;
      if (!siteUrl) throw new Error("CONVEX_SITE_URL is not set");

      // If the Mapper already created a signup account, recording must reuse
      // that exact account — signing up again would make a second account and
      // land on empty state — so send login credentials, not the original
      // signup request.
      const recordCredentials = run.credentialsUsed
        ? { mode: "login" as const, email: run.credentialsUsed.email, password: run.credentialsUsed.password }
        : run.options.credentials;

      // Same-instance routing as the mapper's /map call: the Worker routes on
      // the runId query param, not the body.
      const res = await fetch(`${recorderUrl}/record?runId=${runId}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${serviceToken}` },
        body: JSON.stringify({
          runId,
          callbackUrl: `${siteUrl}/callbacks/runs/${runId}`,
          runToken,
          storyboard,
          options: {
            voice: run.options.voice,
            zoom: run.options.zoom,
            captions: run.options.captions,
            format: run.options.format ?? "horizontal",
          },
          credentials: recordCredentials,
        }),
      });
      if (!res.ok) throw new Error(`recorder /record failed: ${res.status} ${await res.text()}`);

      await ctx.runMutation(internal.runs.markRecording, { runId });
      await ctx.runMutation(internal.lib.events.append, {
        runId,
        agent: "director",
        level: "info",
        message: "sent to the studio",
      });
      return null;
    } catch (err) {
      const message = errorMessage(err);
      await ctx.runMutation(internal.runs.failInternal, { runId, agent: "director", message });
      throw err;
    }
  },
});
