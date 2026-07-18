import { describe, expect, it } from "vitest";
import { beatStartOffsets, cumulativeOffsets, remainingWaitMs, SCENE_TAIL_MS } from "../src/timing.js";

describe("remainingWaitMs", () => {
  it("waits for the narration tail when actions finished early", () => {
    expect(remainingWaitMs(5000, 1000)).toBe(5000 + SCENE_TAIL_MS - 1000);
  });
  it("returns 0 when actions already outran the narration", () => {
    expect(remainingWaitMs(2000, 9000)).toBe(0);
  });
  it("honors a custom tail", () => {
    expect(remainingWaitMs(1000, 0, 250)).toBe(1250);
  });
});

describe("beatStartOffsets", () => {
  it("spreads beats evenly across the narration when spacing is comfortable", () => {
    expect(beatStartOffsets(10000, 5)).toEqual([0, 2000, 4000, 6000, 8000]);
  });
  it("first beat is always at 0", () => {
    expect(beatStartOffsets(9999, 3)[0]).toBe(0);
    expect(beatStartOffsets(500, 4)[0]).toBe(0);
  });
  it("never places beats closer than minSpacingMs when the narration is short", () => {
    // Even spacing would be [0,400,800,1200,1600]; the 1000ms floor pushes them out.
    expect(beatStartOffsets(2000, 5, 1000)).toEqual([0, 1000, 2000, 3000, 4000]);
  });
  it("honors a custom minSpacingMs", () => {
    expect(beatStartOffsets(1000, 3, 500)).toEqual([0, 500, 1000]);
  });
  it("returns an empty list for zero beats and a single 0 for one beat", () => {
    expect(beatStartOffsets(5000, 0)).toEqual([]);
    expect(beatStartOffsets(5000, 1)).toEqual([0]);
  });
});

describe("cumulativeOffsets", () => {
  it("accumulates durations into start offsets", () => {
    expect(cumulativeOffsets([1000, 2000, 500])).toEqual([0, 1000, 3000]);
  });
  it("handles an empty list", () => {
    expect(cumulativeOffsets([])).toEqual([]);
  });
});
