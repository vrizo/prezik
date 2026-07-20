import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { withOneRetry } from "../lib/aiRetry";
import { errorMessage } from "../lib/errors";
import { scoutPrompt } from "../prompts/scout";

// The model-facing core of the Scout agent: Tavily search + the site's own
// homepage, summarized into a short factual product brief. Pure of Convex —
// the Convex action (scout.ts) and the local training runner
// (scripts/local.ts) both call this, so a training run exercises exactly the
// code and OpenAI requests the product makes.

export const SCOUT_MODEL = "gpt-5.4-nano";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

// Progress sink: the Convex action appends run_events, the local runner logs.
export type ScoutEmit = (level: "info" | "error", message: string, url?: string) => Promise<void>;

export async function runScout(url: string, emit: ScoutEmit): Promise<{ brief: string; usage: TokenUsage }> {
  await emit("info", "searching the web");

  const domain = new URL(url).hostname;
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!tavilyKey) throw new Error("TAVILY_API_KEY is not set");

  const searchRes = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: tavilyKey,
      query: `${domain} ${guessNameFromDomain(domain)}`,
      max_results: 5,
    }),
  });
  if (!searchRes.ok) {
    throw new Error(`Tavily search failed: ${searchRes.status} ${await searchRes.text()}`);
  }
  const searchJson = (await searchRes.json()) as { results?: { title?: string; content?: string }[] };
  const searchSummary = (searchJson.results ?? [])
    .map((r) => `- ${r.title ?? ""}: ${r.content ?? ""}`)
    .join("\n");

  await emit("info", "reading the site", url);

  // Homepage fetch is best-effort: a rate limit or an unreachable page is
  // non-critical (the search summary alone can still produce a brief), so
  // it becomes an error event while the run continues. 429 gets a couple
  // of backed-off retries before giving up.
  let homepageText = "";
  let fetchError: string | null = null;
  for (let attempt = 0; ; attempt++) {
    try {
      const homepageRes = await fetch(url);
      if (homepageRes.ok) {
        homepageText = stripTags(await homepageRes.text()).slice(0, 8000);
        fetchError = null;
        break;
      }
      fetchError = `could not fetch ${url}: ${homepageRes.status}`;
      if (homepageRes.status !== 429 || attempt >= 2) break;
    } catch (fetchErr) {
      fetchError = `could not fetch ${url}: ${errorMessage(fetchErr)}`;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
  }
  if (fetchError) {
    await emit("error", fetchError, url);
  }

  // Sum usage across the retry so training cost reports stay honest even
  // when the first attempt's output was rejected.
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  const brief = await withOneRetry(async (retryNote) => {
    const result = await generateText({
      model: openai(SCOUT_MODEL),
      providerOptions: { openai: { reasoningEffort: "low" } },
      prompt: scoutPrompt({ url, searchSummary, homepageText }) + retryNote,
    });
    usage.inputTokens += result.totalUsage.inputTokens ?? 0;
    usage.outputTokens += result.totalUsage.outputTokens ?? 0;
    const trimmed = result.text.trim();
    if (trimmed.length < 40) throw new Error(`brief too short (${trimmed.length} chars): "${trimmed}"`);
    return trimmed;
  });

  // Note: the "brief ready" event is emitted by the caller after it has
  // persisted the brief, so feed ordering matches the stored state.
  return { brief, usage };
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function guessNameFromDomain(hostname: string): string {
  return hostname
    .replace(/^www\./, "")
    .split(".")[0]
    .replace(/[-_]/g, " ");
}
