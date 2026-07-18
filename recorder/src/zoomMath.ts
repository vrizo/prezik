// Pure geometry for the in-page zoom implemented in browser.ts. No DOM and no
// Playwright here, so every rule is unit-testable in isolation.
//
// The page applies, on <html>:
//   transform-origin: originX originY   (layout/page coords, FIXED at first zoom)
//   transform:        translate(dx, dy) scale(scale)
//
// With origin O, translate d, scale s, a layout/page point p renders at viewport
// position:
//   v = O + s * (p - O) + d - scroll
// and inversely a visual (post-transform) viewport point v maps back to layout:
//   p = O + (v + scroll - d - O) / s
// Panning is done with d (translate) so the origin never has to move mid-zoom —
// that keeps chained zooms interpolating smoothly instead of jumping.

export interface ZoomState {
  scale: number;
  originX: number;
  originY: number;
  dx: number;
  dy: number;
}

// A rectangle in viewport coordinates. For a zoomed page these are the visual
// (post-transform) coords returned by getBoundingClientRect / boundingBox.
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 3;

// Never zoom out past 1 (that would flip the frame) or in past MAX_SCALE.
export function clampScale(s: number): number {
  return Math.max(MIN_SCALE, Math.min(s, MAX_SCALE));
}

// Largest clamped scale that fits a w x h box plus `pad` on every side into the
// viewport. Guards a degenerate zero/negative size against division by zero.
export function fitScale(w: number, h: number, vp: Viewport, pad: number): number {
  const fitW = vp.width / Math.max(w + 2 * pad, 1);
  const fitH = vp.height / Math.max(h + 2 * pad, 1);
  return clampScale(Math.min(fitW, fitH));
}

// Forward map: where a layout/page point renders in the viewport under `state`.
// Mostly used by tests to assert the inverse and centering properties.
export function layoutPointToVisual(
  x: number,
  y: number,
  state: ZoomState,
  vp: Viewport,
): { x: number; y: number } {
  return {
    x: state.originX + state.scale * (x - state.originX) + state.dx - vp.scrollX,
    y: state.originY + state.scale * (y - state.originY) + state.dy - vp.scrollY,
  };
}

// Inverse map: a visual (post-transform) viewport point -> its layout/page point.
export function visualPointToLayout(
  x: number,
  y: number,
  state: ZoomState,
  vp: Viewport,
): { x: number; y: number } {
  return {
    x: state.originX + (x + vp.scrollX - state.dx - state.originX) / state.scale,
    y: state.originY + (y + vp.scrollY - state.dy - state.originY) / state.scale,
  };
}

// Inverse map for a whole rect. Layout size = visual size / scale.
export function visualRectToLayout(rect: Rect, state: ZoomState, vp: Viewport): Rect {
  const p = visualPointToLayout(rect.x, rect.y, state, vp);
  return { x: p.x, y: p.y, width: rect.width / state.scale, height: rect.height / state.scale };
}

// First zoom (no transform active): the element's viewport rect IS its layout
// rect. Origin = element center in layout/page coords; translate is zero.
export function computeFirstZoom(rect: Rect, vp: Viewport, pad: number): ZoomState {
  return {
    scale: fitScale(rect.width, rect.height, vp, pad),
    originX: rect.x + vp.scrollX + rect.width / 2,
    originY: rect.y + vp.scrollY + rect.height / 2,
    dx: 0,
    dy: 0,
  };
}

// Chained zoom: already zoomed with `state`; pan/rescale to element B (given by
// its visual viewport rect) keeping the SAME origin. B's layout center is driven
// to the viewport center purely via translate, so the CSS transition goes
// scale(s) -> translate(dx,dy) scale(s2) without ever passing through scale(1).
export function computeChainedZoom(
  visualRect: Rect,
  state: ZoomState,
  vp: Viewport,
  pad: number,
): ZoomState {
  const layout = visualRectToLayout(visualRect, state, vp);
  const s2 = fitScale(layout.width, layout.height, vp, pad);
  const bcx = layout.x + layout.width / 2;
  const bcy = layout.y + layout.height / 2;
  // Solve v = viewportCenter for B's layout center Bc, keeping origin O:
  //   d = viewportCenter + scroll - O - s2 * (Bc - O)
  const dx = vp.width / 2 + vp.scrollX - state.originX - s2 * (bcx - state.originX);
  const dy = vp.height / 2 + vp.scrollY - state.originY - s2 * (bcy - state.originY);
  return { scale: s2, originX: state.originX, originY: state.originY, dx, dy };
}
