import { z } from "zod";

// The contract between the Director agent (produces it) and the recorder
// (executes it). Selectors must be plain CSS. Narration is spoken verbatim.

// Plain union, not discriminatedUnion: OpenAI strict structured outputs
// reject oneOf (which discriminated unions compile to) but accept anyOf.
export const SceneAction = z.union([
  z.object({ type: z.literal("goto"), url: z.string() }),
  z.object({ type: z.literal("click"), selector: z.string() }),
  z.object({
    type: z.literal("fill"),
    selector: z.string(),
    // Literal text, or the placeholders {{email}} / {{password}} which the
    // recorder replaces with the run's credentials at execution time.
    value: z.string(),
  }),
  z.object({ type: z.literal("press"), key: z.string() }),
  z.object({ type: z.literal("hover"), selector: z.string() }),
  z.object({ type: z.literal("scrollTo"), selector: z.string() }),
  z.object({ type: z.literal("highlight"), selector: z.string() }),
  z.object({ type: z.literal("zoom"), selector: z.string(), paddingPx: z.number().int().min(0).max(400) }),
  z.object({ type: z.literal("zoomOut") }),
  z.object({ type: z.literal("wait"), ms: z.number().int().min(100).max(10000) }),
]);
export type SceneAction = z.infer<typeof SceneAction>;

export const Scene = z.object({
  id: z.string(),
  title: z.string(), // short label for the UI timeline and captions chapters
  narration: z.string(), // exact words spoken over this scene
  actions: z.array(SceneAction),
});
export type Scene = z.infer<typeof Scene>;

export const Storyboard = z.object({
  targetUrl: z.string(),
  productName: z.string(),
  tagline: z.string(),
  language: z.string(), // BCP 47, e.g. "en"
  intro: z.object({ narration: z.string() }), // spoken over a title card
  scenes: z.array(Scene).min(1),
  outro: z.object({ narration: z.string() }),
});
export type Storyboard = z.infer<typeof Storyboard>;

export const RunOptions = z.object({
  voice: z.enum(["male", "female", "neutral"]), // neutral default in UI
  zoom: z.boolean(), // on by default in UI
  length: z.enum(["short", "medium", "long"]), // short default in UI
  captions: z.boolean(), // on by default in UI
  // Video orientation: horizontal 16:9 (default) or vertical 9:16. Optional in
  // the stored shape because runs created before the field existed lack it;
  // consumers treat absence as "horizontal".
  format: z.enum(["horizontal", "vertical"]).optional(),
  guidance: z.string().optional(),
  credentials: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("none") }),
    z.object({ mode: z.literal("login"), email: z.string(), password: z.string() }),
    // Recorder invents <yyyymmdd-hhmmss>@<emailDomain> + a random password
    // and reports them back so the run stores what it used.
    z.object({ mode: z.literal("signup"), emailDomain: z.string() }),
  ]),
});
export type RunOptions = z.infer<typeof RunOptions>;

// OpenAI TTS voice per user-facing option.
export const VOICE_MAP = { male: "cedar", female: "marin", neutral: "alloy" } as const;

// Target lengths per option, in scenes (intro/outro excluded).
export const LENGTH_TO_SCENES = { short: { min: 3, max: 5 }, medium: { min: 5, max: 8 }, long: { min: 8, max: 12 } } as const;
