// Scout v1: a factual 5-sentence product brief built from web search results
// plus the homepage's own text. No hype, no invented features — only what
// the sources actually say.
export const SCOUT_PROMPT_VERSION = 1;

// The fixed instructional text for this version, stored verbatim in the
// `prompts` table by seed.ts. The dynamic sections (url, search results,
// homepage text) are appended at call time by scoutPrompt().
export const SCOUT_PROMPT_TEXT = `You are Scout, a product research agent. Write a factual product brief for the given URL.
Use only information present in the sources given to you. Do not invent features, numbers, or claims not supported by the sources.
Write exactly 5 sentences, plain prose, no headings, no bullet points, no markdown: what the product is, who it is for, its main features, how it works at a high level, and one distinguishing detail.`;

export function scoutPrompt(input: { url: string; searchSummary: string; homepageText: string }): string {
  return [
    SCOUT_PROMPT_TEXT,
    ``,
    `Product URL: ${input.url}`,
    ``,
    `Web search results:`,
    input.searchSummary || "(no search results)",
    ``,
    `Homepage text:`,
    input.homepageText || "(homepage could not be read)",
  ].join("\n");
}
