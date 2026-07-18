import type { Page } from "playwright";
import { PREZIK_LOGO_DATA_URI } from "./logo.js";
import {
  computeChainedZoom,
  computeFirstZoom,
  visualPointToLayout,
  visualRectToLayout,
  type ZoomState,
} from "./zoomMath.js";

// Browser-side helpers: a fake cursor, a highlight overlay, an in-page zoom, and
// the intro/outro title card. Everything here is captured by Playwright's
// recordVideo because it happens in the real page.

// Per-page zoom state kept on the Node side (not only in the page) so all the
// geometry lives in the pure, testable functions of zoomMath.ts instead of being
// duplicated inside evaluate callbacks. Absent from the map = no zoom active.
const zoomStates = new WeakMap<Page, ZoomState>();

// Pages whose framenavigated listener has already been attached.
const hookedPages = new WeakSet<Page>();

// Epoch ms when the currently shown highlight has fully faded out. Used so the
// recorder never navigates away or ends the take mid-animation.
const highlightEndAt = new WeakMap<Page, number>();

// Wait until the last highlight's fade-out has completed (no-op when none is
// active or it already finished). Call before a goto or before ending a scene.
export async function waitForHighlightSettled(page: Page): Promise<void> {
  const end = highlightEndAt.get(page);
  if (!end) return;
  const wait = end - Date.now();
  if (wait > 0) await page.waitForTimeout(wait);
  highlightEndAt.delete(page);
}

// A goto lands on a fresh document with no transform (and the page-side saved
// styles are gone with it), so drop any Node-side zoom state on main-frame
// navigation. Attached lazily, exactly once per page. Explicit — no silent
// try/catch recovery elsewhere depends on it.
function ensurePageHooks(page: Page): void {
  if (hookedPages.has(page)) return;
  hookedPages.add(page);
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      zoomStates.delete(page);
      highlightEndAt.delete(page); // the overlay died with the old document
    }
  });
}

// One round-trip that both proves the selector exists (throws otherwise — no
// fallback) and returns its visual viewport rect plus the current viewport, the
// inputs zoomMath needs. `notFound` names the caller for a useful error.
async function measureTarget(page: Page, selector: string, notFound: string) {
  return page.evaluate(
    ({ sel, err }) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(err + sel);
      const r = el.getBoundingClientRect();
      return {
        rect: { x: r.left, y: r.top, width: r.width, height: r.height },
        vp: {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        },
      };
    },
    { sel: selector, err: notFound },
  );
}

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
  ensurePageHooks(page);
  const state = zoomStates.get(page);
  const loc = page.locator(selector).first();
  // scrollIntoViewIfNeeded would fight the active transform; a chained pan already
  // reaches off-screen elements, so skip it while zoomed.
  if (!state) await loc.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
  const box = await loc.boundingBox();
  if (!box) return;
  let x = box.x + box.width / 2;
  let y = box.y + box.height / 2;
  if (state) {
    // boundingBox is visual (post-transform); the cursor div is fixed inside the
    // transformed root, so its translate is interpreted in layout coords — convert.
    const vp = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    }));
    const p = visualPointToLayout(x, y, state, vp);
    x = p.x;
    y = p.y;
  }
  await page.evaluate(([px, py]) => (window as any).__prezikMoveCursor?.(px, py), [x, y]);
  await page.waitForTimeout(300);
}

// Spotlight a target: a dark-gray semi-transparent rounded frame plus a large
// dim shadow over the rest of the page. The frame fades in, holds, then fades
// out on its own so it both appears and disappears with a smooth transition.
// Removes any previous highlight so dims do not stack.
export async function highlightSelector(page: Page, selector: string): Promise<void> {
  ensurePageHooks(page);
  const state = zoomStates.get(page);
  const { rect, vp } = await measureTarget(page, selector, "highlight target not found: ");

  const pad = 6;
  const borderPx = 3;
  // The overlay is position:fixed inside <html>. While zoomed <html> is
  // transformed, so the overlay's containing block is the (transformed) html box
  // and its coords are read in LAYOUT space then transformed with the page —
  // place it at the element's layout rect and it tracks the zoom exactly. Divide
  // pad/border by scale so they still render at their intended pixel size. With
  // no zoom active the visual rect is the layout rect, so use it directly.
  const box = state
    ? (() => {
        const l = visualRectToLayout(rect, state, vp);
        const p = pad / state.scale;
        return {
          left: l.x - p,
          top: l.y - p,
          width: l.width + 2 * p,
          height: l.height + 2 * p,
          border: borderPx / state.scale,
        };
      })()
    : {
        left: rect.x - pad,
        top: rect.y - pad,
        width: rect.width + 2 * pad,
        height: rect.height + 2 * pad,
        border: borderPx,
      };

  const fadeMs = 180;
  const holdMs = 1100;
  highlightEndAt.set(page, Date.now() + fadeMs + holdMs + fadeMs + 80);
  await page.evaluate((b) => {
    document.querySelectorAll(".__prezik_highlight__").forEach((n) => n.remove());
    const d = document.createElement("div");
    d.className = "__prezik_highlight__";
    d.style.cssText =
      "position:fixed;left:" + b.left + "px;top:" + b.top + "px;width:" + b.width + "px;height:" +
      b.height + "px;border:" + b.border + "px solid rgba(48,48,56,.6);border-radius:8px;box-shadow:0 0 0 2000px rgba(15,15,20,.28);z-index:2147483645;pointer-events:none;opacity:0;transition:opacity " + b.fadeMs + "ms ease;";
    document.body.appendChild(d);
    requestAnimationFrame(() => { d.style.opacity = "1"; });
    // Fade the frame back out after a hold so it disappears with a transition
    // instead of vanishing abruptly when the scene ends or is replaced.
    setTimeout(() => {
      if (!d.isConnected) return;
      d.style.opacity = "0";
      setTimeout(() => d.remove(), b.fadeMs + 60);
    }, b.holdMs);
  }, { ...box, fadeMs, holdMs });
  await page.waitForTimeout(fadeMs + 40);
}

// Animated in-page zoom into an element with padding (scale capped at 3).
// Centers the target, then scales <html> around it with a CSS transition.
// Before the first zoom the page's own inline transform/transition/origin are
// saved so zoomOut can return to them exactly (a page may legitimately carry
// its own root transform). Implemented here rather than with playwright-zoom
// (see recorder/README.md for why).
export async function zoomToSelector(page: Page, selector: string, paddingPx: number): Promise<void> {
  ensurePageHooks(page);
  const state = zoomStates.get(page);

  if (!state) {
    // First zoom: bring the element to viewport center (current behavior), then
    // scale <html> around the element center with a transition. Record the state
    // so a later call can chain from it instead of zooming back out first.
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error("zoom target not found: " + sel);
      el.scrollIntoView({ block: "center", inline: "center" });
    }, selector);
    await page.waitForTimeout(320);

    const { rect, vp } = await measureTarget(page, selector, "zoom target not found: ");
    const next = computeFirstZoom(rect, vp, paddingPx);
    await page.evaluate((z) => {
      const de = document.documentElement;
      const w = window as unknown as {
        __prezikZoomSaved?: { transform: string; transition: string; transformOrigin: string };
      };
      if (!w.__prezikZoomSaved) {
        w.__prezikZoomSaved = {
          transform: de.style.transform,
          transition: de.style.transition,
          transformOrigin: de.style.transformOrigin,
        };
      }
      de.style.transformOrigin = z.originX + "px " + z.originY + "px";
      de.style.transition = "transform 600ms ease-in-out";
      de.style.transform = "translate(" + z.dx + "px," + z.dy + "px) scale(" + z.scale + ")";
    }, next);
    zoomStates.set(page, next);
    await page.waitForTimeout(680);
    return;
  }

  // Chained zoom: already zoomed. Do NOT scrollIntoView (it fights the transform);
  // getBoundingClientRect works for off-viewport elements. Keep the origin fixed
  // and pan/rescale via translate so the transition never passes through scale(1)
  // (no full zoom-out flicker between elements).
  const { rect, vp } = await measureTarget(page, selector, "zoom target not found: ");
  const next = computeChainedZoom(rect, state, vp, paddingPx);
  await page.evaluate((z) => {
    const de = document.documentElement;
    // transform-origin stays exactly as set at the first zoom — never move it
    // mid-zoom, that would jump. Pan is entirely in the translate component.
    de.style.transition = "transform 600ms ease-in-out";
    de.style.transform = "translate(" + z.dx + "px," + z.dy + "px) scale(" + z.scale + ")";
  }, next);
  zoomStates.set(page, next);
  await page.waitForTimeout(680);
}

// Animate back to the transform saved at zoom time (not blindly "none"), then
// restore the saved inline transform/transition/origin values verbatim. The
// restore fires on transitionend, with a 750ms cap for the case where the
// animated value equals the current one and no transition event ever fires.
export async function zoomOut(page: Page, log?: { info(msg: string): void }): Promise<void> {
  ensurePageHooks(page);
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
  // Clear Node-side state regardless: after this the next zoom is a first zoom.
  zoomStates.delete(page);
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
  .name{font-size:min(104px,10vw);font-weight:800;letter-spacing:-2px;margin:0 48px;text-align:center;line-height:1.05;}
  .tag{font-size:min(40px,4.5vw);font-weight:400;color:#6B675E;margin-top:28px;text-align:center;max-width:1400px;padding:0 48px;}
  </style></head><body><div class="name">${esc(productName)}</div><div class="tag">${esc(tagline)}</div></body></html>`;
}

// Final end card: the Prezik logo (300px wide) centered on a white background
// with the product link beneath it. Held for a fixed 2s at the very end of the
// video. The logo is an inlined data URI (see logo.ts) so the card is fully
// self-contained.
export function endCardHtml(link: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;}
  body{background:#FFFFFF;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}
  img{width:min(300px,42vw);height:auto;display:block;}
  .link{margin-top:28px;font-size:min(34px,4.2vw);font-weight:500;color:#3B3A36;letter-spacing:-0.5px;}
  </style></head><body><img src="${PREZIK_LOGO_DATA_URI}" alt="Prezik"><div class="link">${esc(link)}</div></body></html>`;
}
