import { v } from "convex/values";
import { generateObject, jsonSchema } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { Storyboard, LENGTH_TO_SCENES } from "@prezik/shared";
import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { withOneRetry } from "../lib/aiRetry";
import { errorMessage } from "../lib/errors";
import { directorPrompt } from "../prompts/director";

// OpenAI's strict structured outputs reject "oneOf" (seen live: run
// jx77qh86… failed with «'oneOf' is not permitted»), and zod's
// discriminatedUnion (SceneAction in shared) serializes to exactly that.
// Strict mode does accept the equivalent "anyOf", so rewrite the keyword in
// the derived JSON schema and keep the real shared Storyboard zod schema as
// the validator. The contract itself stays untouched in shared/.
function oneOfToAnyOf(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(oneOfToAnyOf);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      out[key === "oneOf" ? "anyOf" : key] = oneOfToAnyOf(value);
    }
    return out;
  }
  return node;
}

const storyboardModelSchema = jsonSchema<Storyboard>(
  oneOfToAnyOf(z.toJSONSchema(Storyboard)) as Parameters<typeof jsonSchema>[0],
  {
    validate: (value) => {
      const parsed = Storyboard.safeParse(value);
      return parsed.success ? { success: true, value: parsed.data } : { success: false, error: parsed.error };
    },
  },
);

// Director: one strong-model call that turns the brief + sitemap into a
// Storyboard, then hands the storyboard to the recorder's /record endpoint.
// Runs after Mapper reports mapDone (scheduled from convex/http.ts).
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

      const sceneRange = LENGTH_TO_SCENES[run.options.length];

      const storyboard = await withOneRetry(async (retryNote) => {
        const { object } = await generateObject({
          model: openai("gpt-5.6-sol"),
          schema: storyboardModelSchema,
          providerOptions: { openai: { reasoningEffort: "high" } },
          prompt:
            directorPrompt({
              url: run.url,
              brief: run.brief ?? "",
              pages,
              options: run.options,
              guidance: run.guidance,
              sceneRange,
            }) + retryNote,
        });
        if (object.scenes.length < sceneRange.min || object.scenes.length > sceneRange.max) {
          throw new Error(
            `expected ${sceneRange.min}-${sceneRange.max} scenes for length "${run.options.length}", got ${object.scenes.length}`,
          );
        }
        return object;
      });

      await ctx.runMutation(internal.storyboards.save, { runId, data: storyboard });
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

      const res = await fetch(`${recorderUrl}/record`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${serviceToken}` },
        body: JSON.stringify({
          runId,
          callbackUrl: `${siteUrl}/callbacks/runs/${runId}`,
          runToken,
          storyboard,
          options: { voice: run.options.voice, zoom: run.options.zoom, captions: run.options.captions },
          credentials: run.options.credentials,
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
