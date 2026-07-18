import { describe, expect, it } from "vitest";
import {
  clampScale,
  computeChainedZoom,
  computeFirstZoom,
  fitScale,
  layoutPointToVisual,
  MAX_SCALE,
  visualPointToLayout,
  visualRectToLayout,
  type Viewport,
  type ZoomState,
} from "../src/zoomMath.js";

const VP: Viewport = { width: 1920, height: 1080, scrollX: 0, scrollY: 0 };

describe("clampScale", () => {
  it("never zooms out below 1 or in past the max", () => {
    expect(clampScale(0.2)).toBe(1);
    expect(clampScale(1.7)).toBeCloseTo(1.7);
    expect(clampScale(99)).toBe(MAX_SCALE);
  });
});

describe("fitScale", () => {
  it("picks the more constraining dimension and clamps", () => {
    // A tall-narrow element is limited by height.
    expect(fitScale(100, 900, VP, 0)).toBeCloseTo(1080 / 900);
    // A tiny element would over-zoom, so it clamps to the max.
    expect(fitScale(10, 10, VP, 0)).toBe(MAX_SCALE);
  });

  it("guards a zero-size element against divide-by-zero", () => {
    expect(Number.isFinite(fitScale(0, 0, VP, 0))).toBe(true);
  });
});

describe("computeFirstZoom", () => {
  it("centers the origin on the element and starts with no translate", () => {
    const rect = { x: 800, y: 400, width: 320, height: 200 };
    const s = computeFirstZoom(rect, VP, 40);
    expect(s.originX).toBe(960); // 800 + 320/2
    expect(s.originY).toBe(500); // 400 + 200/2
    expect(s.dx).toBe(0);
    expect(s.dy).toBe(0);
    expect(s.scale).toBeGreaterThan(1);
  });

  it("folds page scroll into the (layout) origin", () => {
    const scrolled: Viewport = { ...VP, scrollX: 50, scrollY: 300 };
    const rect = { x: 100, y: 100, width: 200, height: 100 };
    const s = computeFirstZoom(rect, scrolled, 0);
    expect(s.originX).toBe(100 + 50 + 100);
    expect(s.originY).toBe(100 + 300 + 50);
  });
});

describe("visual <-> layout inversion", () => {
  const state: ZoomState = { scale: 2.5, originX: 900, originY: 500, dx: 120, dy: -80 };

  it("round-trips a point through forward then inverse map", () => {
    const layout = { x: 640, y: 360 };
    const v = layoutPointToVisual(layout.x, layout.y, state, VP);
    const back = visualPointToLayout(v.x, v.y, state, VP);
    expect(back.x).toBeCloseTo(layout.x);
    expect(back.y).toBeCloseTo(layout.y);
  });

  it("divides visual size by scale to get layout size", () => {
    const layout = visualRectToLayout({ x: 500, y: 500, width: 250, height: 125 }, state, VP);
    expect(layout.width).toBeCloseTo(100);
    expect(layout.height).toBeCloseTo(50);
  });

  it("accounts for scroll when inverting", () => {
    const scrolled: Viewport = { ...VP, scrollX: 40, scrollY: 90 };
    const v = layoutPointToVisual(700, 300, state, scrolled);
    const back = visualPointToLayout(v.x, v.y, state, scrolled);
    expect(back.x).toBeCloseTo(700);
    expect(back.y).toBeCloseTo(300);
  });
});

describe("computeChainedZoom", () => {
  // Start already zoomed into some element.
  const first = computeFirstZoom({ x: 200, y: 200, width: 300, height: 200 }, VP, 40);

  it("drives element B's layout center to the viewport center", () => {
    // B measured as a visual rect somewhere off toward the corner.
    const bVisual = { x: 1400, y: 150, width: 200, height: 160 };
    const next = computeChainedZoom(bVisual, first, VP, 40);

    // B's layout center...
    const bLayout = visualRectToLayout(bVisual, first, VP);
    const bcx = bLayout.x + bLayout.width / 2;
    const bcy = bLayout.y + bLayout.height / 2;
    // ...renders at the viewport center under the new state.
    const rendered = layoutPointToVisual(bcx, bcy, next, VP);
    expect(rendered.x).toBeCloseTo(VP.width / 2);
    expect(rendered.y).toBeCloseTo(VP.height / 2);
  });

  it("keeps the origin fixed and never passes through scale 1", () => {
    const next = computeChainedZoom({ x: 900, y: 500, width: 400, height: 300 }, first, VP, 40);
    expect(next.originX).toBe(first.originX);
    expect(next.originY).toBe(first.originY);
    expect(next.scale).toBeGreaterThanOrEqual(1);
  });

  it("respects scroll offset when centering", () => {
    const scrolled: Viewport = { ...VP, scrollX: 120, scrollY: 60 };
    const bVisual = { x: 300, y: 300, width: 240, height: 180 };
    const next = computeChainedZoom(bVisual, first, scrolled, 40);
    const bLayout = visualRectToLayout(bVisual, first, scrolled);
    const bc = layoutPointToVisual(
      bLayout.x + bLayout.width / 2,
      bLayout.y + bLayout.height / 2,
      next,
      scrolled,
    );
    expect(bc.x).toBeCloseTo(scrolled.width / 2);
    expect(bc.y).toBeCloseTo(scrolled.height / 2);
  });
});
