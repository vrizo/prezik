import { v } from "convex/values";

// Server-side cap on free-form user guidance (options.guidance). Mirrored in
// app/src/features/start/InstructionsField.tsx's INSTRUCTIONS_MAX for the
// textarea — keep both in sync by hand.
export const GUIDANCE_MAX_LENGTH = 2000;

// Convex `v` validators mirroring the zod schemas in shared/src/storyboard.ts
// and shared/src/events.ts. Convex tables can't consume zod directly, so the
// shape is hand-mirrored here. Keep in sync with shared/src by hand whenever
// either side changes.

export const credentialsValidator = v.union(
  v.object({ mode: v.literal("none") }),
  v.object({ mode: v.literal("login"), email: v.string(), password: v.string() }),
  v.object({ mode: v.literal("signup"), emailDomain: v.string() }),
);

export const runOptionsValidator = v.object({
  voice: v.union(v.literal("male"), v.literal("female"), v.literal("neutral")),
  zoom: v.boolean(),
  length: v.union(v.literal("short"), v.literal("medium"), v.literal("long")),
  captions: v.boolean(),
  format: v.optional(v.union(v.literal("horizontal"), v.literal("vertical"))),
  guidance: v.optional(v.string()),
  credentials: credentialsValidator,
});

export const runStatusValidator = v.union(
  v.literal("created"),
  v.literal("exploring"),
  v.literal("planning"),
  v.literal("needs_credentials"),
  v.literal("recording"),
  v.literal("uploading"),
  v.literal("done"),
  v.literal("failed"),
);

export const agentNameValidator = v.union(
  v.literal("scout"),
  v.literal("mapper"),
  v.literal("director"),
  v.literal("presenter"),
);

export const runEventLevelValidator = v.union(v.literal("info"), v.literal("error"));

// Mirrors PageElement in shared/src/events.ts: an element harvested from a
// page. The Director may only use selectors that appear here, verbatim.
export const pageElementValidator = v.object({
  selector: v.string(),
  label: v.string(),
  kind: v.union(
    v.literal("link"),
    v.literal("button"),
    v.literal("input"),
    v.literal("heading"),
    v.literal("other"),
  ),
});

const sceneActionValidator = v.union(
  v.object({ type: v.literal("goto"), url: v.string() }),
  v.object({ type: v.literal("click"), selector: v.string() }),
  v.object({ type: v.literal("fill"), selector: v.string(), value: v.string() }),
  v.object({ type: v.literal("press"), key: v.string() }),
  v.object({ type: v.literal("hover"), selector: v.string() }),
  v.object({ type: v.literal("scrollTo"), selector: v.string() }),
  v.object({ type: v.literal("highlight"), selector: v.string() }),
  v.object({ type: v.literal("zoom"), selector: v.string(), paddingPx: v.number() }),
  v.object({ type: v.literal("zoomOut") }),
  v.object({ type: v.literal("wait"), ms: v.number() }),
);

const sceneValidator = v.object({
  id: v.string(),
  title: v.string(),
  narration: v.string(),
  actions: v.array(sceneActionValidator),
});

// A scene as it appears while the Director is still streaming: enough to draw
// a scene card in the live Plan view before the full storyboard exists.
export const planProgressSceneValidator = v.object({
  title: v.string(),
  narration: v.string(),
  actionCount: v.number(),
});

export const storyboardValidator = v.object({
  targetUrl: v.string(),
  productName: v.string(),
  tagline: v.string(),
  language: v.string(),
  intro: v.object({ narration: v.string() }),
  scenes: v.array(sceneValidator),
  outro: v.object({ narration: v.string() }),
});
