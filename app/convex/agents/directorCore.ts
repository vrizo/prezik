import { streamText, Output, parsePartialJson, jsonSchema } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { Storyboard } from "@prezik/shared";
import type { RunOptions, SitePage } from "@prezik/shared";
import { withOneRetry } from "../lib/aiRetry";
import { directorPrompt } from "../prompts/director";
import type { TokenUsage } from "./scoutCore";

// The model-facing core of the Director agent: one strong-model streaming
// call that turns the brief + sitemap into a Storyboard, with validation and
// the one-retry rule. Pure of Convex — the Convex action (director.ts) and
// the local training runner (scripts/local.ts) both call this, so a training
// run exercises exactly the code and OpenAI requests the product makes.

export const DIRECTOR_MODEL = "gpt-5.6-sol";

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

// The Director decides whether the run can even be filmed: if the product
// is behind a sign-in and no credentials were given, it returns
// needsCredentials=true and a null storyboard instead of a bogus docs video.
export const DirectorDecision = z.object({
  needsCredentials: z.boolean(),
  reason: z.string(),
  storyboard: Storyboard.nullable(),
});
export type DirectorDecision = z.infer<typeof DirectorDecision>;

const directorDecisionModelSchema = jsonSchema<DirectorDecision>(
  oneOfToAnyOf(z.toJSONSchema(DirectorDecision)) as Parameters<typeof jsonSchema>[0],
  {
    validate: (value) => {
      const parsed = DirectorDecision.safeParse(value);
      return parsed.success ? { success: true, value: parsed.data } : { success: false, error: parsed.error };
    },
  },
);

export type DraftScene = { title: string; narration: string; actionCount: number };

// Pull the scenes that are complete enough to show from a partially-streamed
// DirectorDecision. A scene counts once it has both a title and a narration;
// its narration may still be growing token by token.
function draftedScenes(value: unknown): DraftScene[] {
  if (!value || typeof value !== "object") return [];
  const storyboard = (value as Record<string, unknown>).storyboard;
  if (!storyboard || typeof storyboard !== "object") return [];
  const scenes = (storyboard as Record<string, unknown>).scenes;
  if (!Array.isArray(scenes)) return [];
  const out: DraftScene[] = [];
  for (const raw of scenes) {
    if (!raw || typeof raw !== "object") continue;
    const scene = raw as Record<string, unknown>;
    const title = typeof scene.title === "string" ? scene.title : "";
    const narration = typeof scene.narration === "string" ? scene.narration : "";
    if (!title || !narration) continue;
    out.push({
      title,
      narration,
      actionCount: Array.isArray(scene.actions) ? scene.actions.length : 0,
    });
  }
  return out;
}

// Live progress sink. The Convex action mirrors writes into plan_progress
// (the Plan view) and drafted scenes into run_events; the local runner logs.
export interface DirectorProgress {
  // Called on attempt start, then throttled to ~1/s while streaming, then on
  // the reasoning->output transition and once more at the end.
  write(state: { thinking: string; thinkingDone: boolean; scenes: DraftScene[] }): Promise<void>;
  // Called exactly once per scene, in order, as soon as it is settled.
  sceneDrafted(index: number, scene: DraftScene): Promise<void>;
}

export async function generateStoryboard(input: {
  url: string;
  brief: string;
  pages: Pick<SitePage, "url" | "title" | "purpose" | "elements">[];
  options: RunOptions;
  guidance?: string;
  sceneRange: { min: number; max: number };
  progress: DirectorProgress;
}): Promise<{ decision: DirectorDecision; usage: TokenUsage }> {
  const { progress, sceneRange } = input;

  // Sum usage across the retry so training cost reports stay honest even
  // when the first attempt's output was rejected.
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  // One streaming attempt is one attempt for retry purposes: the model
  // streams its reasoning summary and the plan JSON, both are mirrored to
  // the progress sink, then the finished object is validated.
  const decision = await withOneRetry(async (retryNote) => {
    await progress.write({ thinking: "", thinkingDone: false, scenes: [] });

    const result = streamText({
      model: openai(DIRECTOR_MODEL),
      output: Output.object({ schema: directorDecisionModelSchema }),
      // "medium" halves storyboard latency vs "high" (~107s → ~50s). The
      // v6/v7 prompt rules carry the planning burden; if training scores
      // drop, this is the first knob to turn back. reasoningSummary streams
      // the model's own thinking so the Plan view can show it live.
      providerOptions: { openai: { reasoningEffort: "medium", reasoningSummary: "auto" } },
      prompt:
        directorPrompt({
          url: input.url,
          brief: input.brief,
          pages: input.pages,
          options: input.options,
          guidance: input.guidance,
          sceneRange,
        }) + retryNote,
    });

    let thinking = "";
    let thinkingDone = false;
    let outputText = "";
    let scenes: DraftScene[] = [];
    let announced = 0;
    let lastWrite = 0;

    const writeProgress = async () => {
      lastWrite = Date.now();
      await progress.write({ thinking, thinkingDone, scenes });
    };
    const maybeWriteProgress = async () => {
      if (Date.now() - lastWrite >= 1000) await writeProgress();
    };
    const announceUpTo = async (limit: number) => {
      while (announced < limit) {
        await progress.sceneDrafted(announced, scenes[announced]);
        announced++;
      }
    };

    for await (const part of result.fullStream) {
      if (part.type === "reasoning-start") {
        // The summary arrives in parts; keep a blank line between them.
        if (thinking) thinking += "\n\n";
      } else if (part.type === "reasoning-delta") {
        thinking += part.text;
        await maybeWriteProgress();
      } else if (part.type === "text-delta") {
        // First storyboard token means reasoning is over. Flush the
        // transition immediately, bypassing the 1s throttle, so the Plan
        // view flips the Thinking spinner to a check without lag.
        if (!thinkingDone) {
          thinkingDone = true;
          await writeProgress();
        }
        outputText += part.text;
        const parsed = await parsePartialJson(outputText);
        scenes = draftedScenes(parsed.value);
        // A scene is settled once a later scene has appeared, so its
        // narration is done; announce those and leave the tail streaming.
        await announceUpTo(scenes.length - 1);
        await maybeWriteProgress();
      } else if (part.type === "error") {
        throw part.error;
      }
    }

    // Count tokens before output validation so a rejected attempt's spend is
    // still recorded.
    const streamUsage = await result.totalUsage;
    usage.inputTokens += streamUsage.inputTokens ?? 0;
    usage.outputTokens += streamUsage.outputTokens ?? 0;

    const object = await result.output;

    scenes = object.storyboard
      ? object.storyboard.scenes.map((s) => ({
          title: s.title,
          narration: s.narration,
          actionCount: s.actions.length,
        }))
      : [];
    await announceUpTo(scenes.length);
    await writeProgress();

    if (!object.needsCredentials && object.storyboard === null) {
      throw new Error("needsCredentials is false but storyboard is null");
    }
    if (object.storyboard) {
      const count = object.storyboard.scenes.length;
      if (count < sceneRange.min || count > sceneRange.max) {
        throw new Error(
          `expected ${sceneRange.min}-${sceneRange.max} scenes for length "${input.options.length}", got ${count}`,
        );
      }
    }
    return object;
  });

  return { decision, usage };
}
