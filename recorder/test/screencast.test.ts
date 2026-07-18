import { describe, expect, it } from "vitest";
import { buildConcat } from "../src/screencast.js";

describe("buildConcat", () => {
  it("derives per-frame durations from timestamps and holds the last frame to endMs", () => {
    const out = buildConcat(["a.jpg", "b.jpg"], [1000, 1500], 4000);
    expect(out).toBe(
      [
        "ffconcat version 1.0",
        "file 'a.jpg'",
        "duration 0.500",
        "file 'b.jpg'",
        "duration 2.500",
        "file 'b.jpg'",
        "",
      ].join("\n"),
    );
  });

  it("clamps a non-positive gap to 1ms so ffmpeg never sees duration 0", () => {
    const out = buildConcat(["a.jpg", "b.jpg"], [1000, 1000], 1000);
    expect(out).toContain("duration 0.001");
  });

  it("rejects mismatched inputs and empty captures", () => {
    expect(() => buildConcat([], [], 0)).toThrow();
    expect(() => buildConcat(["a.jpg"], [1, 2], 3)).toThrow();
  });
});
