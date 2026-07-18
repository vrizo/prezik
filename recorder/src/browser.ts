import type { Page } from "playwright";

// Browser-side helpers: a fake cursor, a highlight overlay, an in-page zoom, and
// the intro/outro title card. Everything here is captured by Playwright's
// recordVideo because it happens in the real page.

// tsx (esbuild keepNames) wraps nested named functions in __name(...) helper
// calls; when Playwright serializes an evaluate callback into the page that
// helper does not exist there. Install a pass-through once per document so
// evaluate callbacks with nested named functions work. Add to every context.
export function esbuildHelperInitScript(): string {
  return `window.__name = window.__name || ((f) => f);`;
}

// Injected via context.addInitScript on every document. Draws a fixed SVG cursor
// on <html> (a sibling of <body>, so it is unaffected when zoom transforms
// <html> is applied — the cursor scales with the frame like a real recording).
export function cursorInitScript(): string {
  return `(() => {
    const ID = "__prezik_cursor__";
    const svg = '<svg width="30" height="30" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 3l14 7.6-6.1 1.7 3.4 6.2-2.8 1.5-3.4-6.2L5 20V3z" fill="#111827" stroke="#ffffff" stroke-width="1.2" stroke-linejoin="round"/></svg>';
    const ensure = () => {
      if (document.getElementById(ID)) return;
      const d = document.createElement("div");
      d.id = ID;
      d.setAttribute("aria-hidden", "true");
      d.innerHTML = svg;
      d.style.cssText = "position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;transition:transform 200ms ease-in-out;transform:translate(140px,160px);filter:drop-shadow(0 1px 2px rgba(0,0,0,.45));will-change:transform;";
      (document.body || document.documentElement).appendChild(d);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensure);
    else ensure();
    window.__prezikMoveCursor = (x, y) => {
      const d = document.getElementById(ID);
      if (d) d.style.transform = "translate(" + x + "px," + y + "px)";
    };
  })();`;
}

// Glide the fake cursor to an element's center and wait for the transition.
export async function moveCursorToSelector(page: Page, selector: string): Promise<void> {
  const loc = page.locator(selector).first();
  await loc.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
  const box = await loc.boundingBox();
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.evaluate(([px, py]) => (window as any).__prezikMoveCursor?.(px, py), [x, y]);
  await page.waitForTimeout(300);
}

// Spotlight a target: orange rounded outline plus a large dim shadow over the
// rest of the page. Removes any previous highlight so dims do not stack.
export async function highlightSelector(page: Page, selector: string): Promise<void> {
  await page.evaluate((sel) => {
    document.querySelectorAll(".__prezik_highlight__").forEach((n) => n.remove());
    const el = document.querySelector(sel);
    if (!el) throw new Error("highlight target not found: " + sel);
    const r = el.getBoundingClientRect();
    const pad = 6;
    const d = document.createElement("div");
    d.className = "__prezik_highlight__";
    d.style.cssText =
      "position:fixed;left:" + (r.left - pad) + "px;top:" + (r.top - pad) + "px;width:" +
      (r.width + 2 * pad) + "px;height:" + (r.height + 2 * pad) +
      "px;border:3px solid #E8590C;border-radius:8px;box-shadow:0 0 0 2000px rgba(15,15,20,.28);z-index:2147483645;pointer-events:none;opacity:0;transition:opacity 260ms ease;";
    document.body.appendChild(d);
    requestAnimationFrame(() => { d.style.opacity = "1"; });
  }, selector);
  await page.waitForTimeout(340);
}

// Animated in-page zoom into an element with padding (scale capped at 3).
// Centers the target, then scales <html> around it with a CSS transition.
// Before the first zoom the page's own inline transform/transition/origin are
// saved so zoomOut can return to them exactly (a page may legitimately carry
// its own root transform). Implemented here rather than with playwright-zoom
// (see recorder/README.md for why).
export async function zoomToSelector(page: Page, selector: string, paddingPx: number): Promise<void> {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error("zoom target not found: " + sel);
    el.scrollIntoView({ block: "center", inline: "center" });
  }, selector);
  await page.waitForTimeout(320);
  await page.evaluate(
    ({ sel, pad }) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error("zoom target not found: " + sel);
      const r = el.getBoundingClientRect();
      const targetW = r.width + 2 * pad;
      const targetH = r.height + 2 * pad;
      const scale = Math.max(1, Math.min(window.innerWidth / Math.max(targetW, 1), window.innerHeight / Math.max(targetH, 1), 3));
      const originX = r.left + window.scrollX + r.width / 2;
      const originY = r.top + window.scrollY + r.height / 2;
      const de = document.documentElement;
      const w = window as unknown as { __prezikZoomSaved?: { transform: string; transition: string; transformOrigin: string } };
      if (!w.__prezikZoomSaved) {
        w.__prezikZoomSaved = {
          transform: de.style.transform,
          transition: de.style.transition,
          transformOrigin: de.style.transformOrigin,
        };
      }
      de.style.transformOrigin = originX + "px " + originY + "px";
      de.style.transition = "transform 600ms ease-in-out";
      de.style.transform = "scale(" + scale + ")";
    },
    { sel: selector, pad: paddingPx },
  );
  await page.waitForTimeout(680);
}

// Animate back to the transform saved at zoom time (not blindly "none"), then
// restore the saved inline transform/transition/origin values verbatim. The
// restore fires on transitionend, with a 750ms cap for the case where the
// animated value equals the current one and no transition event ever fires.
export async function zoomOut(page: Page, log?: { info(msg: string): void }): Promise<void> {
  const didZoomOut = await page.evaluate(() => {
    const w = window as unknown as { __prezikZoomSaved?: { transform: string; transition: string; transformOrigin: string } };
    const saved = w.__prezikZoomSaved;
    if (!saved) return false;
    const de = document.documentElement;
    return new Promise<boolean>((resolve) => {
      const finish = () => {
        de.removeEventListener("transitionend", finish);
        de.style.transition = saved.transition;
        de.style.transform = saved.transform;
        de.style.transformOrigin = saved.transformOrigin;
        delete w.__prezikZoomSaved;
        resolve(true);
      };
      de.addEventListener("transitionend", finish, { once: true });
      setTimeout(finish, 750);
      de.style.transition = "transform 600ms ease-in-out";
      de.style.transform = saved.transform || "none";
    });
  });
  if (!didZoomOut) log?.info("zoomOut: no active zoom, nothing to undo");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Cream title card for intro and outro.
export function titleCardHtml(productName: string, tagline: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;}
  body{background:#FAF6EF;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#3B3A36;}
  .name{font-size:104px;font-weight:800;letter-spacing:-2px;margin:0 48px;text-align:center;line-height:1.05;}
  .tag{font-size:40px;font-weight:400;color:#6B675E;margin-top:28px;text-align:center;max-width:1400px;padding:0 48px;}
  </style></head><body><div class="name">${esc(productName)}</div><div class="tag">${esc(tagline)}</div></body></html>`;
}
