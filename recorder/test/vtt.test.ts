import { describe, expect, it } from "vitest";
import { buildSrt, buildVtt, formatTimestamp, splitSentences } from "../src/vtt.js";

describe("formatTimestamp", () => {
  it("formats milliseconds as HH:MM:SS.mmm", () => {
    expect(formatTimestamp(0)).toBe("00:00:00.000");
    expect(formatTimestamp(1500)).toBe("00:00:01.500");
    expect(formatTimestamp(3_661_042)).toBe("01:01:01.042");
  });
  it("never goes negative", () => {
    expect(formatTimestamp(-10)).toBe("00:00:00.000");
  });
});

describe("splitSentences", () => {
  it("splits on terminal punctuation and keeps it", () => {
    expect(splitSentences("Hello there. How are you?")).toEqual(["Hello there.", "How are you?"]);
  });
  it("returns a single item when there is no break", () => {
    expect(splitSentences("Just one line")).toEqual(["Just one line"]);
  });
});

describe("buildVtt", () => {
  it("starts with the WEBVTT header", () => {
    expect(buildVtt([]).startsWith("WEBVTT")).toBe(true);
  });

  it("emits one cue for a single-sentence segment", () => {
    const vtt = buildVtt([{ startMs: 2000, audioMs: 3000, narration: "One sentence only" }]);
    expect(vtt).toContain("00:00:02.000 --> 00:00:05.000");
    expect(vtt).toContain("One sentence only");
  });

  it("splits a multi-sentence segment into sequential cues within its window", () => {
    // Equal-length sentences => the proportional time split lands exactly halfway.
    const vtt = buildVtt([{ startMs: 0, audioMs: 4000, narration: "Aaaa. Bbbb." }]);
    const cues = vtt.split("\n").filter((l) => l.includes("-->"));
    expect(cues.length).toBe(2);
    expect(cues[0]).toBe("00:00:00.000 --> 00:00:02.000");
    expect(cues[1]).toBe("00:00:02.000 --> 00:00:04.000");
  });

  it("skips empty narration", () => {
    expect(buildVtt([{ startMs: 0, audioMs: 1000, narration: "   " }])).toBe("WEBVTT\n");
  });
});

describe("buildSrt", () => {
  it("numbers cues and uses comma millisecond separators", () => {
    const srt = buildSrt([{ startMs: 2000, audioMs: 4000, narration: "Aaaa. Bbbb." }]);
    const lines = srt.split("\n");
    expect(lines[0]).toBe("1");
    expect(lines[1]).toBe("00:00:02,000 --> 00:00:04,000");
    expect(lines[2]).toBe("Aaaa.");
    expect(lines[4]).toBe("2");
    expect(lines[5]).toBe("00:00:04,000 --> 00:00:06,000");
    expect(lines[6]).toBe("Bbbb.");
  });

  it("is empty for empty narration", () => {
    expect(buildSrt([{ startMs: 0, audioMs: 1000, narration: "   " }])).toBe("");
  });
});
