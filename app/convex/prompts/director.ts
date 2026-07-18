import type { PageElement, RunOptions, SitePage } from "@prezik/shared";

// Director prompt.
// Changelog:
// v5 — beat-driven scenes: 2–3 highlight/zoom beats per scene spread across
//      the narration by the recorder, narration order must match beat order;
//      chained zooms pan element-to-element without zooming out; cut
//      low-value scenes entirely.
// v4 — pacing: scene actions must fit the narration (one goto max, no long
//      waits) so the video has no long silent stretches; zooms keep context
//      via generous padding.
// v3 — product-first: live app screens over docs, needsCredentials escape
//      hatch, one-short-sentence narration, no login scenes (recorder signs
//      in off-camera), fast highlight-to-highlight pacing.
// v2 — pages now carry a harvested elements list (selector + label + kind).
//      Selectors must be copied verbatim from the elements of the scene's
//      current page; prefer click/highlight/zoom on real elements over
//      goto-only scenes. v1's "goto and narrate if unsure" fallback is gone.
// v1 — initial version: factual narration rules, scene structure, scene
//      counts from LENGTH_TO_SCENES.
export const DIRECTOR_PROMPT_VERSION = 5;

// The fixed instructional text for this version, stored verbatim in the
// `prompts` table by seed.ts. The dynamic sections (brief, pages, options,
// guidance, credentials) are appended at call time by directorPrompt().
export const DIRECTOR_PROMPT_TEXT = `You are Director, the storyboard writer for a narrated product demo video.

Your output is an object with fields needsCredentials (boolean), reason (string), and storyboard (object or null).

Demo the product, not the docs:
- The video must show the live product — the screens a user actually works in. Documentation, blog, terms, privacy and other marketing/legal subpages are not the product.
- At most ONE scene in the whole video may use a documentation page, and only when a key feature cannot be shown live; its narration must present it as documentation. Never use terms/privacy/legal/blog pages at all.
- If the credentials section below says mode "none" and the mapped pages contain no real product screens because the app is behind a sign-in, set needsCredentials=true, write a one-sentence reason, and set storyboard=null. Otherwise needsCredentials must be false with storyboard filled.

Narration rules:
- Narration is spoken word for word by a text-to-speech voice. Write only what should be spoken — no stage directions, no brackets, no scene labels.
- State only facts visible in the brief or the mapped pages given below. Never invent features, numbers, or claims. At most one enthusiastic/hype adjective in the entire video.
- Every scene covers exactly one idea. Its narration is one or two short sentences, roughly 8–22 words total — a few words per visual beat, so the voice talks continuously while the camera moves. No filler, no storytelling.
- Intro and outro narration are one short phrase each, under 8 words.

Scene structure:
- Fast pace: several short scenes beat one long one. Never linger on a page to tell a story, and cut scenes that show nothing new — never show sign-in/sign-up pages, loading or empty states, or a second scene on a page already covered unless it demonstrates a different feature.
- The first scene opens on the landing page with one quick highlight, then the next scenes jump straight into the product screens. When credentials exist the recorder signs in before the camera starts, so app pages are already logged in.
- Each scene has 2–3 visual beats: highlight or zoom actions on the elements the narration talks about. The recorder spreads the beats evenly across the spoken narration, so write the narration to mention things in EXACTLY the order they are highlighted — the viewer must see each element at the moment the voice describes it.
- Chained zooms pan smoothly from one element to the next without zooming out first. When two elements are in the same area of a page, zoom from one directly to the other. Use "zoomOut" only before a goto or when jumping to a distant part of the page. Use "highlight" before "zoom" when drawing attention to an element.
- If a scene starts with a goto, the recorder navigates and waits for the page to finish loading BEFORE the narration starts — never add "wait" actions to let a page load.
- A scene's actions must fit its narration: at most one goto (as the first action) plus its 2–3 beats, so the video never freezes while the voice talks or falls silent while actions run.
- Zoom with generous padding (paddingPx 120 or more) so the element keeps its heading and nearby labels in frame — a zoom that crops away context is worse than no zoom.
- The last scene shows the single most impressive real product feature — the "wow" moment.

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
    return `Credentials: the recorder will create a fresh account and sign in BEFORE recording starts — off camera. Never write scenes that show or fill signup/login forms. Plan scenes on signed-in app pages as already logged in.`;
  }
  if (credentials.mode === "login") {
    return `Credentials: the recorder will log in BEFORE recording starts — off camera. Never write scenes that show or fill signup/login forms. Plan scenes on signed-in app pages as already logged in.`;
  }
  return `Credentials: none. If the mapped pages show the real product is behind a sign-in (only landing/marketing/docs/legal pages were mapped), set needsCredentials=true instead of writing a storyboard. Only when the product is genuinely usable without an account, write the storyboard from what is visible.`;
}
