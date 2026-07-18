import { describe, expect, it } from "vitest";
import { cumulativeOffsets, remainingWaitMs, SCENE_TAIL_MS } from "../src/timing.js";

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

describe("cumulativeOffsets", () => {
  it("accumulates durations into start offsets", () => {
    expect(cumulativeOffsets([1000, 2000, 500])).toEqual([0, 1000, 3000]);
  });
  it("handles an empty list", () => {
    expect(cumulativeOffsets([])).toEqual([]);
  });
});
