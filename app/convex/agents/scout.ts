import { v } from "convex/values";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { withOneRetry } from "../lib/aiRetry";
import { errorMessage } from "../lib/errors";
import { scoutPrompt } from "../prompts/scout";

// Scout: Tavily search + the site's own homepage, summarized into a short
// factual product brief. Runs in parallel with Mapper.
export const run = internalAction({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    try {
      await ctx.runMutation(internal.runs.markExploring, { runId });
      const run = await ctx.runQuery(api.runs.get, { runId });
      if (!run) throw new Error("run not found");

      await ctx.runMutation(internal.lib.events.append, {
        runId,
        agent: "scout",
        level: "info",
        message: "searching the web",
      });

      const domain = new URL(run.url).hostname;
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

      await ctx.runMutation(internal.lib.events.append, {
        runId,
        agent: "scout",
        level: "info",
        message: "reading the site",
        url: run.url,
      });

      // Homepage fetch is best-effort: a rate limit or an unreachable page is
      // non-critical (the search summary alone can still produce a brief), so
      // it becomes an error event while the run continues. 429 gets a couple
      // of backed-off retries before giving up.
      let homepageText = "";
      let fetchError: string | null = null;
      for (let attempt = 0; ; attempt++) {
        try {
          const homepageRes = await fetch(run.url);
          if (homepageRes.ok) {
            homepageText = stripTags(await homepageRes.text()).slice(0, 8000);
            fetchError = null;
            break;
          }
          fetchError = `could not fetch ${run.url}: ${homepageRes.status}`;
          if (homepageRes.status !== 429 || attempt >= 2) break;
        } catch (fetchErr) {
          fetchError = `could not fetch ${run.url}: ${errorMessage(fetchErr)}`;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
      }
      if (fetchError) {
        await ctx.runMutation(internal.lib.events.append, {
          runId,
          agent: "scout",
          level: "error",
          message: fetchError,
          url: run.url,
        });
      }

      const brief = await withOneRetry(async (retryNote) => {
        const { text } = await generateText({
          model: openai("gpt-5.4-nano"),
          providerOptions: { openai: { reasoningEffort: "low" } },
          prompt: scoutPrompt({ url: run.url, searchSummary, homepageText }) + retryNote,
        });
        const trimmed = text.trim();
        if (trimmed.length < 40) throw new Error(`brief too short (${trimmed.length} chars): "${trimmed}"`);
        return trimmed;
      });

      await ctx.runMutation(internal.runs.setBrief, { runId, brief });
      await ctx.runMutation(internal.lib.events.append, {
        runId,
        agent: "scout",
        level: "info",
        message: `brief ready: ${brief}`,
      });
      return null;
    } catch (err) {
      const message = errorMessage(err);
      await ctx.runMutation(internal.runs.failInternal, { runId, agent: "scout", message });
      throw err;
    }
  },
});

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
