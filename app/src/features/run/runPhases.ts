import type { AgentName, RunStatus, Storyboard } from "@prezik/shared";

// The Creating phase has three sub-steps. Everything here is pure derivation
// from run status + the reactive queries, so it is unit-tested in isolation.
export type Step = "explore" | "plan" | "record";
export type StepState = "done" | "active" | "locked";

const STEP_ORDER: readonly Step[] = ["explore", "plan", "record"];

// The live sub-step implied by the run status. For the two terminal states
// that stop mid-flight (needs_credentials / failed) the active step can't be
// read from the status alone, so the caller passes the step that was running
// (from failedStep) as a fallback.
export function stepOf(status: RunStatus, failedAt: Step = "record"): Step {
  switch (status) {
    case "created":
    case "exploring":
      return "explore";
    case "planning":
      return "plan";
    case "recording":
    case "uploading":
    case "done":
      return "record";
    case "needs_credentials":
    case "failed":
      return failedAt;
  }
}

// Per-chip state: steps before the current one are done, the current one is
// active, later ones are locked.
export function stepStates(current: Step): Record<Step, StepState> {
  const currentIndex = STEP_ORDER.indexOf(current);
  const states = {} as Record<Step, StepState>;
  STEP_ORDER.forEach((step, index) => {
    states[step] = index < currentIndex ? "done" : index === currentIndex ? "active" : "locked";
  });
  return states;
}

// Which sub-step a failure landed on. The erroring agent's name can't be
// trusted here: the recorder container reports as "presenter" even while it
// runs the map crawl during explore. Data presence is the ground truth — a
// saved storyboard means the run made it into recording; director activity
// without one means it died planning; otherwise it never left explore.
export function failedStep(
  events: readonly { agent: AgentName; level: "info" | "error" }[],
  hasStoryboard: boolean,
): Step {
  if (hasStoryboard) return "record";
  return events.some((event) => event.agent === "director") ? "plan" : "explore";
}

// Origin-relative path with any trailing slash stripped, so "/" and
// "https://x/" and "/dashboard/" collapse the way a human counts pages.
function normalizePath(url: string): string {
  let path: string;
  try {
    path = new URL(url, "http://x").pathname;
  } catch {
    path = url;
  }
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path;
}

// Rough "~N pages" estimate: how many distinct paths the crawl has seen so
// far, counting both the pages it has read and every page they link to.
export function pageEstimate(pages: readonly { url: string; linksTo: readonly string[] }[]): number {
  const paths = new Set<string>();
  for (const page of pages) {
    paths.add(normalizePath(page.url));
    for (const link of page.linksTo) paths.add(normalizePath(link));
  }
  return paths.size;
}

// Index into storyboard.scenes of the scene the recorder is currently on,
// taken from the most recent event that carries a sceneId. Null when there's
// no storyboard yet or nothing has referenced a scene.
export function currentSceneIndex(
  events: readonly { sceneId?: string }[],
  storyboard: Storyboard | null,
): number | null {
  if (!storyboard) return null;
  let sceneId: string | undefined;
  for (const event of events) {
    if (event.sceneId) sceneId = event.sceneId;
  }
  if (!sceneId) return null;
  const index = storyboard.scenes.findIndex((scene) => scene.id === sceneId);
  return index === -1 ? null : index;
}

// The hostname shown in the Explore/Record subtitles ("Crawling <b>host</b>").
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// The path chip shown throughout ("/dashboard", "/invoices/new"). Falls back
// to the raw string for anything that isn't a parseable URL.
export function pathOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url, "http://x").pathname;
  } catch {
    return url;
  }
}

// The path of the last event that has a url, for the "Stopped on <path>" and
// "Now capturing <path>" lines.
export function latestEventUrl(events: readonly { url?: string }[]): string | null {
  let url: string | null = null;
  for (const event of events) {
    if (event.url) url = event.url;
  }
  return url;
}
