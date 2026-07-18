import { chromium } from "playwright";
import type { Page } from "playwright";
import { dismissConsentBanner, performAuth } from "./auth.js";
import { esbuildHelperInitScript } from "./browser.js";
import type { Emitter } from "./callbacks.js";
import { attachBrowserTelemetry } from "./diag.js";
import type { Logger } from "./log.js";
import { viewportFor, type MapRequest } from "./types.js";

// Contract cap is 20 pages; MAP_MAX_PAGES is an explicit override (e.g. to keep
// a crawl short and polite when testing) and never exceeds 20.
const MAX_PAGES = Math.min(20, Number(process.env.MAP_MAX_PAGES) || 20);
const MAX_MS = 4 * 60 * 1000;
// docs/legal pages are near-useless for a product demo; a small sample is enough
// for the planner, so at most this many low-priority pages are mapped per run.
const MAX_LOW_PRIORITY = 2;
// Let late-loading content (fonts, images, client-rendered widgets) settle after
// domcontentloaded so screenshots don't capture half-rendered pages.
const SCREENSHOT_SETTLE_MS = 2000;
// Rate-limit handling: on HTTP 429 the crawl slows down (delay between page
// loads, doubling per 429 up to the cap) and the page is re-queued for another
// try instead of failing the run.
const BACKOFF_INITIAL_MS = 2000;
const BACKOFF_MAX_MS = 15000;
const MAX_RETRIES_429 = 2;

// Next politeness delay after a 429: start at the initial backoff, double per
// hit, capped. Pure — unit-tested in test/map.test.ts.
export function backoffDelayMs(currentMs: number): number {
  return Math.min(Math.max(currentMs * 2, BACKOFF_INITIAL_MS), BACKOFF_MAX_MS);
}

// Dedupe key: origin + path, ignoring query and hash.
function normalize(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname.replace(/\/+$/, "");
  } catch {
    return url;
  }
}

function trimSentence(s: string, max = 180): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? one.slice(0, max - 1).trimEnd() + "…" : one;
}

interface PageInfo {
  title: string;
  purpose: string;
  links: string[];
  elements: { selector: string; label: string; kind: "link" | "button" | "input" | "heading" | "other" }[];
}

// Factual page purpose from headings/meta only (no AI call here — the smart
// summarization happens in the Mapper agent elsewhere), plus up to 20 prominent
// elements with selectors verified unique on the page at harvest time.
async function extractInfo(page: Page): Promise<PageInfo> {
  const raw = await page.evaluate(() => {
    const meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    const firstPara = document.querySelector("main p, article p, p");

    const visible = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const s = getComputedStyle(el);
      return s.visibility !== "hidden" && s.display !== "none";
    };
    const unique = (sel: string, el: Element): boolean => {
      try {
        const hits = document.querySelectorAll(sel);
        return hits.length === 1 && hits[0] === el;
      } catch {
        return false; // selector did not parse; treat as not unique
      }
    };
    // #id, [data-testid], tag[aria-label], then a short path anchored at the
    // nearest #id ancestor using :nth-of-type. Null when nothing is unique.
    const selectorFor = (el: Element): string | null => {
      const id = (el as HTMLElement).id;
      if (id) {
        const s = "#" + CSS.escape(id);
        if (unique(s, el)) return s;
      }
      const testid = el.getAttribute("data-testid");
      if (testid) {
        const s = `[data-testid="${CSS.escape(testid)}"]`;
        if (unique(s, el)) return s;
      }
      const aria = el.getAttribute("aria-label");
      if (aria) {
        const s = `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(aria)}"]`;
        if (unique(s, el)) return s;
      }
      const parts: string[] = [];
      let node: Element | null = el;
      for (let depth = 0; node && node !== document.body && depth < 5; depth++) {
        const nodeId = (node as HTMLElement).id;
        if (nodeId) {
          parts.unshift("#" + CSS.escape(nodeId));
          const s = parts.join(" > ");
          if (unique(s, el)) return s;
          return null;
        }
        const tag = node.tagName.toLowerCase();
        const parent: Element | null = node.parentElement;
        if (!parent) break;
        const sameTag = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
        parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(node) + 1})` : tag);
        node = parent;
      }
      const s = parts.join(" > ");
      return s && unique(s, el) ? s : null;
    };
    const labelFor = (el: Element): string => {
      const aria = el.getAttribute("aria-label")?.trim();
      const text = el.textContent?.replace(/\s+/g, " ").trim();
      const placeholder = el.getAttribute("placeholder")?.trim();
      const name = el.getAttribute("name")?.trim();
      return (aria || text || placeholder || name || "").slice(0, 60);
    };

    // Custom controls (rating scales, styled radios/checkboxes) hide the real
    // input and show a clickable <label for=...> instead. The hidden input
    // fails the visibility check and the label matches no other group, so
    // without this the control is invisible to the Director. Clicking the
    // label toggles the input, so it is harvested as a button.
    const isProxyLabel = (el: Element): boolean => {
      const forId = el.getAttribute("for");
      if (!forId) return false;
      const input = document.getElementById(forId);
      return !!input && input.matches("input, select, textarea") && !visible(input);
    };

    // Priority order = prominence: nav links, buttons/CTAs, labels standing in
    // for hidden inputs, inputs, headings, remaining content links.
    const groups: { sel: string; kind: "link" | "button" | "input" | "heading" | "other"; accept?: (el: Element) => boolean }[] = [
      { sel: "nav a[href], header a[href]", kind: "link" },
      { sel: 'button, [role="button"], a[class*="btn" i], a[class*="button" i], input[type="submit"]', kind: "button" },
      { sel: "label[for]", kind: "button", accept: isProxyLabel },
      { sel: 'input:not([type="hidden"]):not([type="submit"]), textarea, select', kind: "input" },
      { sel: "h1, h2, h3", kind: "heading" },
      { sel: "main a[href], article a[href], section a[href]", kind: "link" },
    ];
    const elements: { selector: string; label: string; kind: "link" | "button" | "input" | "heading" | "other" }[] = [];
    const taken = new Set<Element>();
    const takenSelectors = new Set<string>();
    for (const g of groups) {
      if (elements.length >= 20) break;
      for (const el of Array.from(document.querySelectorAll(g.sel))) {
        if (elements.length >= 20) break;
        if (taken.has(el) || !visible(el)) continue;
        if (g.accept && !g.accept(el)) continue;
        const label = labelFor(el);
        if (!label) continue;
        const selector = selectorFor(el);
        if (!selector || takenSelectors.has(selector)) continue;
        taken.add(el);
        takenSelectors.add(selector);
        elements.push({ selector, label, kind: g.kind });
      }
    }

    return {
      title: document.title || "",
      h1: document.querySelector("h1")?.textContent?.trim() || "",
      metaDesc: meta?.content?.trim() || "",
      firstPara: firstPara?.textContent?.trim() || "",
      links: Array.from(document.querySelectorAll("a[href]"))
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((h) => h.startsWith("http")),
      elements,
    };
  });
  const purpose = trimSentence([raw.h1, raw.metaDesc || raw.firstPara].filter(Boolean).join(" — ")) || raw.title;
  return { title: raw.title, purpose, links: raw.links, elements: raw.elements };
}

async function screenshot(page: Page, emit: Emitter): Promise<string | null> {
  const jpeg = await page.screenshot({ type: "jpeg", quality: 70 });
  return emit.uploadScreenshot(jpeg);
}

// A discovered link is low-priority when its pathname looks like docs, blog, or
// legal boilerplate — pages that add little to a product demo.
export function isLowPriorityUrl(url: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }
  return /\b(docs?|blog|privacy|terms|legal|policy|policies|changelog|cookies?|impressum|imprint)\b/i.test(pathname);
}

export async function runMap(req: MapRequest, emit: Emitter, log: Logger): Promise<void> {
  // Crawl scope: the whole site, not just the starting origin — products often
  // serve the live app from a subdomain (web.example.com) while the landing
  // lives on example.com. Approximation: same last-two-label domain (right for
  // .com/.app targets; multi-part public suffixes like .co.uk over-match,
  // which at worst crawls a sibling site page).
  const baseDomain = new URL(req.url).hostname.split(".").slice(-2).join(".");
  const inScope = (link: string): boolean => {
    try {
      const host = new URL(link).hostname;
      return host === baseDomain || host.endsWith("." + baseDomain);
    } catch {
      return false;
    }
  };
  // Same pinned flag as record.ts: never depend on Playwright's default for
  // the 64MB /dev/shm production container.
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  // Same viewport as recording (record.ts): selectors are harvested from this
  // exact layout, and responsive pages restructure their DOM across widths —
  // a mismatch makes harvested selectors dangle at record time.
  const context = await browser.newContext({ viewport: viewportFor(req.format), deviceScaleFactor: 1.5 });
  await context.addInitScript(esbuildHelperInitScript());
  const page = await context.newPage();
  const telemetry = attachBrowserTelemetry(page, log);
  const deadline = Date.now() + MAX_MS;
  const seen = new Set<string>();
  // Two queues: product pages first, docs/legal drained only when main is empty.
  // The starting URL always goes to main.
  const main: string[] = [req.url];
  const low: string[] = [];
  const enqueue = (link: string) => {
    if (!inScope(link) || seen.has(normalize(link))) return;
    (isLowPriorityUrl(link) ? low : main).push(link);
  };
  let count = 0;
  let lowCount = 0;
  // Politeness delay between page loads; 0 until the site rate-limits us.
  let crawlDelayMs = 0;
  const retries429 = new Map<string, number>();

  try {
    // Pre-crawl: dismiss any cookie banner once (consent persists for the whole
    // context) so screenshots are clean and its buttons aren't harvested as
    // page elements, then sign in when credentials were given.
    await page.goto(req.url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await dismissConsentBanner(page, log);
    if (req.credentials.mode !== "none") {
      const creds = await performAuth(page, req.credentials, emit, log, { strict: false, agent: "mapper" });
      await dismissConsentBanner(page, log); // the app may show its own banner after login
      // Signed in: map the landing/dashboard we ended up on first, so the planner
      // sees the real product rather than the public marketing page.
      if (creds) main.unshift(page.url());
    }

    while (count < MAX_PAGES && Date.now() < deadline) {
      let url: string;
      let fromLow = false;
      if (main.length > 0) {
        url = main.shift()!;
      } else if (low.length > 0 && lowCount < MAX_LOW_PRIORITY) {
        url = low.shift()!;
        fromLow = true;
      } else {
        break;
      }
      const key = normalize(url);
      if (seen.has(key)) continue;
      seen.add(key);

      if (crawlDelayMs > 0) await page.waitForTimeout(crawlDelayMs);
      let response;
      try {
        response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      } catch (e) {
        await emit.emit({ kind: "event", event: { agent: "mapper", level: "error", message: `could not fetch ${url}: ${String(e)}`, url } });
        continue;
      }
      // page.goto resolves on any HTTP status; an error page must not be mapped
      // as if it were product content. 429 means we're crawling too fast: slow
      // down and requeue the page for another attempt; other 4xx/5xx (and a
      // 429 that keeps failing) become an error event and the crawl moves on.
      const status = response?.status() ?? 200;
      if (status === 429) {
        crawlDelayMs = backoffDelayMs(crawlDelayMs);
        const attempts = (retries429.get(key) ?? 0) + 1;
        retries429.set(key, attempts);
        if (attempts <= MAX_RETRIES_429) {
          seen.delete(key);
          (fromLow ? low : main).push(url);
          log.info(`rate limited on ${url} (attempt ${attempts}); crawl delay now ${crawlDelayMs}ms`);
          continue;
        }
        await emit.emit({ kind: "event", event: { agent: "mapper", level: "error", message: `could not fetch ${url}: 429`, url } });
        continue;
      }
      if (status >= 400) {
        await emit.emit({ kind: "event", event: { agent: "mapper", level: "error", message: `could not fetch ${url}: ${status}`, url } });
        continue;
      }
      // Settle before extracting/screenshotting so the capture shows the real page.
      await page.waitForTimeout(SCREENSHOT_SETTLE_MS);
      // A redirect can land on a page that was already mapped (e.g. several
      // URLs all redirect to /app once signed in). Skip it instead of
      // extracting, screenshotting and uploading the same page again.
      const landedKey = normalize(page.url());
      if (landedKey !== key && seen.has(landedKey)) {
        log.info(`skipping ${url}: redirected to already-mapped ${page.url()}`);
        continue;
      }
      seen.add(landedKey);

      const info = await extractInfo(page);
      const shotId = await screenshot(page, emit);
      const current = page.url();
      count++;
      if (fromLow) lowCount++;

      await emit.emit({
        kind: "event",
        event: { agent: "mapper", level: "info", message: `mapped ${info.title || current}`, url: current, screenshotId: shotId ?? undefined },
      });
      await emit.emit({
        kind: "page",
        page: {
          url: current,
          title: info.title,
          purpose: info.purpose,
          screenshotId: shotId ?? undefined,
          linksTo: info.links,
          elements: info.elements,
        },
      });
      log.info(`mapped page ${count}: ${current} (${info.elements.length} elements)`);

      for (const link of info.links) enqueue(link);
    }
    // Per-page failures are tolerated above, but zero readable pages means the
    // planner has nothing to work with — that IS critical, so fail the run.
    if (count === 0) throw new Error("mapping failed: no pages could be read");
    await emit.emit({ kind: "mapDone", pageCount: count });
    log.info(`map done: ${count} pages`);
  } finally {
    telemetry.disarm(); // intentional close
    await context.close();
    await browser.close();
  }
}
