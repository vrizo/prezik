import { z } from "zod";

// Run lifecycle. Scout and Mapper run in parallel, Director needs Mapper's
// sitemap, Presenter (recorder) needs the storyboard.
export const RunStatus = z.enum([
  "created",
  "exploring", // scout + mapper active
  "planning", // director active
  "recording", // recorder container active
  "uploading",
  "done",
  "failed",
]);
export type RunStatus = z.infer<typeof RunStatus>;

export const AgentName = z.enum(["scout", "mapper", "director", "presenter"]);
export type AgentName = z.infer<typeof AgentName>;

// One live feed entry. Written by Convex actions and by the recorder via
// HTTP callback. The UI subscribes to these per run.
export const RunEvent = z.object({
  agent: AgentName,
  level: z.enum(["info", "error"]),
  message: z.string(),
  url: z.string().optional(), // where the agent is right now
  screenshotId: z.string().optional(), // Convex storage id for the live panel
  sceneId: z.string().optional(),
});
export type RunEvent = z.infer<typeof RunEvent>;

// An interactive or notable element harvested from a page. The Director may
// only use selectors that appear here, verbatim.
export const PageElement = z.object({
  selector: z.string(), // unique on the page (verified at harvest time)
  label: z.string(), // visible text or aria-label, trimmed
  kind: z.enum(["link", "button", "input", "heading", "other"]),
});
export type PageElement = z.infer<typeof PageElement>;

// A page discovered by the Mapper.
export const SitePage = z.object({
  url: z.string(),
  title: z.string(),
  purpose: z.string(), // one sentence, what this page is for
  screenshotId: z.string().optional(),
  linksTo: z.array(z.string()),
  elements: z.array(PageElement),
});
export type SitePage = z.infer<typeof SitePage>;

// Recorder -> Convex HTTP callbacks (Bearer <runToken>).
export const RecorderCallback = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("event"), event: RunEvent }),
  z.object({ kind: z.literal("page"), page: SitePage }), // map mode
  z.object({ kind: z.literal("mapDone"), pageCount: z.number() }),
  z.object({
    kind: z.literal("credentials"), // what signup mode actually used
    email: z.string(),
    password: z.string(),
  }),
  z.object({ kind: z.literal("sceneDone"), sceneId: z.string() }),
  z.object({
    kind: z.literal("videoReady"),
    playbackUrl: z.string(), // absolute URL of the mp4 (recorder Worker serving from R2)
    captionsUrl: z.string().optional(), // absolute URL of the VTT, when captions were on
    durationSec: z.number(),
  }),
  z.object({ kind: z.literal("recorderFailed"), error: z.string() }),
]);
export type RecorderCallback = z.infer<typeof RecorderCallback>;
