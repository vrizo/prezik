import { chromium } from "playwright";
import type { Page } from "playwright";
import { esbuildHelperInitScript } from "./browser.js";
import type { Emitter } from "./callbacks.js";
import { attachBrowserTelemetry } from "./diag.js";
import type { Logger } from "./log.js";
import type { MapRequest } from "./types.js";
import { randomPassword, timestampId } from "./util.js";

// Contract cap is 12 pages; MAP_MAX_PAGES is an explicit override (e.g. to keep
// a crawl short and polite when testing) and never exceeds 12.
const MAX_PAGES = Math.min(12, Number(process.env.MAP_MAX_PAGES) || 12);
const MAX_MS = 3 * 60 * 1000;

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

    // Priority order = prominence: nav links, buttons/CTAs, inputs, headings,
    // remaining content links.
    const groups: { sel: string; kind: "link" | "button" | "input" | "heading" | "other" }[] = [
      { sel: "nav a[href], header a[href]", kind: "link" },
      { sel: 'button, [role="button"], a[class*="btn" i], a[class*="button" i], input[type="submit"]', kind: "button" },
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

// Best-effort login/signup. On any missing element, posts a precise error event
// and returns so the crawl continues over public pages.
async function handleAuth(page: Page, req: MapRequest, emit: Emitter, log: Logger): Promise<void> {
  if (req.credentials.mode === "none") return;
  const mode = req.credentials.mode;

  const linkSelectors =
    mode === "login"
      ? ['a[href*="login" i]', 'a[href*="signin" i]', 'a[href*="sign-in" i]']
      : ['a[href*="signup" i]', 'a[href*="sign-up" i]', 'a[href*="register" i]', 'a[href*="join" i]'];

  let navigated = false;
  for (const sel of linkSelectors) {
    const el = page.locator(sel).first();
    if ((await el.count()) > 0) {
      try {
        await el.click({ timeout: 5000 });
        await page.waitForLoadState("domcontentloaded");
        navigated = true;
        break;
      } catch { /* try next */ }
    }
  }
  if (!navigated) {
    const re = mode === "login" ? /log ?in|sign ?in/i : /sign ?up|register|create account|get started/i;
    const byText = page.getByRole("link", { name: re }).first();
    if ((await byText.count()) > 0) {
      try {
        await byText.click({ timeout: 5000 });
        await page.waitForLoadState("domcontentloaded");
        navigated = true;
      } catch { /* fall through */ }
    }
  }

  const emailInput = page.locator('input[type="email"], input[name*="email" i], input[id*="email" i]').first();
  const passInput = page.locator('input[type="password"]').first();
  const noEmail = (await emailInput.count()) === 0;
  const noPass = (await passInput.count()) === 0;
  if (noEmail || noPass) {
    const missing = [noEmail ? "email input" : "", noPass ? "password input" : ""].filter(Boolean).join(" and ");
    const msg = `${mode}: ${navigated ? "" : "no auth link found; "}${missing} not found at ${page.url()}; continuing with public pages`;
    await emit.emit({ kind: "event", event: { agent: "mapper", level: "error", message: msg, url: page.url() } });
    log.error(msg);
    return;
  }

  let email: string;
  let password: string;
  if (mode === "signup") {
    email = `${timestampId()}@${req.credentials.emailDomain}`;
    password = randomPassword(16);
  } else {
    email = req.credentials.email;
    password = req.credentials.password;
  }
  await emailInput.fill(email);
  await passInput.fill(password);
  const submit = page.locator('button[type="submit"], input[type="submit"]').first();
  if ((await submit.count()) > 0) await submit.click({ timeout: 8000 }).catch(() => {});
  else await passInput.press("Enter");
  await page.waitForTimeout(2500);
  log.info(`${mode} submitted as ${email}`);
  if (mode === "signup") await emit.emit({ kind: "credentials", email, password });
}

export async function runMap(req: MapRequest, emit: Emitter, log: Logger): Promise<void> {
  const origin = new URL(req.url).origin;
  // Same pinned flag as record.ts: never depend on Playwright's default for
  // the 64MB /dev/shm production container.
  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await context.addInitScript(esbuildHelperInitScript());
  const page = await context.newPage();
  const telemetry = attachBrowserTelemetry(page, log);
  const deadline = Date.now() + MAX_MS;
  const seen = new Set<string>();
  const queue: string[] = [req.url];
  let count = 0;

  try {
    if (req.credentials.mode !== "none") {
      await page.goto(req.url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await handleAuth(page, req, emit, log);
    }

    while (queue.length > 0 && count < MAX_PAGES && Date.now() < deadline) {
      const url = queue.shift()!;
      const key = normalize(url);
      if (seen.has(key)) continue;
      seen.add(key);

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      } catch (e) {
        await emit.emit({ kind: "event", event: { agent: "mapper", level: "error", message: `failed to load ${url}: ${String(e)}`, url } });
        continue;
      }
      await page.waitForTimeout(700);
      // A redirect can land on a different URL; mark that one seen too so we do
      // not re-crawl it when a link points at the post-redirect address.
      seen.add(normalize(page.url()));

      const info = await extractInfo(page);
      const shotId = await screenshot(page, emit);
      const current = page.url();
      count++;

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

      for (const link of info.links) {
        if (link.startsWith(origin) && !seen.has(normalize(link))) queue.push(link);
      }
    }
    await emit.emit({ kind: "mapDone", pageCount: count });
    log.info(`map done: ${count} pages`);
  } finally {
    telemetry.disarm(); // intentional close
    await context.close();
    await browser.close();
  }
}
