import type { PageElement, RunOptions, SitePage } from "@prezik/shared";

// Director prompt.
// Changelog:
// v2 — pages now carry a harvested elements list (selector + label + kind).
//      Selectors must be copied verbatim from the elements of the scene's
//      current page; prefer click/highlight/zoom on real elements over
//      goto-only scenes. v1's "goto and narrate if unsure" fallback is gone.
// v1 — initial version: factual narration rules, scene structure, scene
//      counts from LENGTH_TO_SCENES.
export const DIRECTOR_PROMPT_VERSION = 2;

// The fixed instructional text for this version, stored verbatim in the
// `prompts` table by seed.ts. The dynamic sections (brief, pages, options,
// guidance, credentials) are appended at call time by directorPrompt().
export const DIRECTOR_PROMPT_TEXT = `You are Director, the storyboard writer for a narrated product demo video.

Narration rules:
- Narration is spoken word for word by a text-to-speech voice. Write only what should be spoken — no stage directions, no brackets, no scene labels.
- State only facts visible in the brief or the mapped pages given below. Never invent features, numbers, or claims. At most one enthusiastic/hype adjective in the entire video.
- Every scene covers exactly one idea.
- Keep narration to about 2 sentences per scene.

Scene structure:
- The first scene opens on the landing page (or performs signup/login if instructed below). The last scene shows the single most impressive real feature found in the mapped pages — the "wow" moment.
- A scene that shows a feature must highlight or zoom the element that embodies that feature, so the viewer sees exactly what the narration is talking about.
- Prefer scenes that interact — click, highlight, zoom on real elements — over scenes that only navigate. A goto-only scene is a last resort for pages with no useful elements.
- Use "highlight" before "zoom" when drawing attention to an element, and "zoomOut" before moving to a new area of the page.

Selector rules:
- Each mapped page below lists its elements: selector, visible label, and kind (link/button/input/heading/other). These are the ONLY selectors that exist.
- Every selector in a click/fill/hover/scrollTo/highlight/zoom action must be copied VERBATIM from the elements list of the page the scene is currently on — never from a different page's list, never invented, never modified.
- To move between pages, use a "goto" action with a page url copied from the sitemap below.`;

export function directorPrompt(input: {
  url: string;
  brief: string;
  pages: Pick<SitePage, "url" | "title" | "purpose" | "elements">[];
  options: RunOptions;
  guidance?: string;
  sceneRange: { min: number; max: number };
}): string {
  const pagesList = input.pages.map(formatPage).join("\n") || "(no pages were mapped)";

  const lines = [
    DIRECTOR_PROMPT_TEXT,
    ``,
    `Target: ${input.url}`,
    ``,
    `Product brief (from Scout):`,
    input.brief || "(no brief available)",
    ``,
    `Pages mapped by the browsing agent — the only source of truth for what pages and elements exist:`,
    pagesList,
    ``,
    `Video target: "${input.options.length}" length. Language: en. Produce between ${input.sceneRange.min} and ${input.sceneRange.max} scenes (not counting intro/outro).`,
  ];

  if (input.guidance) lines.push(`User guidance — follow this closely: ${input.guidance}`);
  lines.push(describeCredentials(input.options.credentials));

  return lines.join("\n");
}

function formatPage(p: Pick<SitePage, "url" | "title" | "purpose" | "elements">): string {
  const header = `- ${p.url} — "${p.title}": ${p.purpose}`;
  if (p.elements.length === 0) return `${header}\n  elements: (none harvested)`;
  const elements = p.elements.map(formatElement).join("\n");
  return `${header}\n  elements:\n${elements}`;
}

function formatElement(e: PageElement): string {
  return `    [${e.kind}] "${e.label}" -> ${e.selector}`;
}

function describeCredentials(credentials: RunOptions["credentials"]): string {
  if (credentials.mode === "signup") {
    return `Credentials: the recorder will sign up for a new account using the literal placeholders {{email}} and {{password}} inside "fill" action values. Make the FIRST scene perform this signup — use the signup page's input element selectors from its elements list, fill email and password with the placeholders, then click its submit element — before showing anything else.`;
  }
  if (credentials.mode === "login") {
    return `Credentials: the recorder will log in using the literal placeholders {{email}} and {{password}} inside "fill" action values. Make the FIRST scene log in — use the login page's input element selectors from its elements list, fill both fields with the placeholders, then click its submit element — before showing anything else.`;
  }
  return `Credentials: none. Do not attempt to sign up or log in; only show what is visible without an account.`;
}
