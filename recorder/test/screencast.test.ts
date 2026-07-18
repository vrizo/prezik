import { describe, expect, it } from "vitest";
import { buildConcat, compressSilence } from "../src/screencast.js";

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

describe("compressSilence", () => {
  it("leaves a timeline with no over-long gaps untouched", () => {
    const files = ["a.jpg", "b.jpg", "c.jpg"];
    const ts = [1000, 1100, 1200];
    // One clip covers the whole span.
    const out = compressSilence(files, ts, 1300, [{ offsetMs: 0, durationMs: 300 }], 800);
    expect(out.files).toEqual(files);
    expect(out.timestampsMs).toEqual(ts);
    expect(out.endMs).toBe(1300);
    expect(out.clipOffsetsMs).toEqual([0]);
  });

  it("cuts a long silent gap between clips down to maxGapMs, keeping the newest frames", () => {
    // videoStart=1000. Clip A [1000,1500], Clip B [4000,4500]. Gap [1500,4000]=2500ms.
    const files = ["f0", "f1", "f2", "f3", "f4", "f5", "f6", "f7"];
    const ts = [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500];
    const clips = [
      { offsetMs: 0, durationMs: 500 }, // A
      { offsetMs: 3000, durationMs: 500 }, // B
    ];
    const out = compressSilence(files, ts, 4500, clips, 800);
    // Removed span [1500,3200): frames at 1500,2000,2500,3000 dropped; 1700ms cut.
    expect(out.files).toEqual(["f0", "f5", "f6", "f7"]);
    expect(out.timestampsMs).toEqual([1000, 1800, 2300, 2800]);
    expect(out.endMs).toBe(2800);
    // Clip A unchanged at 0; Clip B pulled from 3000 -> 1300 (500 audio + 800 gap).
    expect(out.clipOffsetsMs).toEqual([0, 1300]);
  });

  it("trims a long trailing gap after the last clip", () => {
    // videoStart=0. Clip [0,500]. Trailing gap [500,3000]=2500ms.
    const files = ["f0", "f1", "f2", "f3"];
    const ts = [0, 500, 1500, 2500];
    const out = compressSilence(files, ts, 3000, [{ offsetMs: 0, durationMs: 500 }], 800);
    // Removed [500,2200): frames at 500,1500 dropped; 1700ms cut; endMs 3000->1300.
    expect(out.files).toEqual(["f0", "f3"]);
    expect(out.timestampsMs).toEqual([0, 800]);
    expect(out.endMs).toBe(1300);
    expect(out.clipOffsetsMs).toEqual([0]);
  });

  it("trims a long leading gap before the first clip and re-bases offsets", () => {
    // videoStart=0. Leading gap [0,2500] before Clip [2500,3000].
    const files = ["f0", "f1", "f2", "f3"];
    const ts = [0, 1000, 2500, 3000];
    const out = compressSilence(files, ts, 3000, [{ offsetMs: 2500, durationMs: 500 }], 800);
    // Removed [0,1700): frames at 0,1000 dropped; 1700ms cut.
    // Surviving frames 2500,3000 -> 800,1300; new video start 800.
    expect(out.files).toEqual(["f2", "f3"]);
    expect(out.timestampsMs).toEqual([800, 1300]);
    expect(out.endMs).toBe(1300);
    // Clip start 2500 -> 800, minus new videoStart 800 -> offset 0.
    expect(out.clipOffsetsMs).toEqual([0]);
  });
});
