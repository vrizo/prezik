import { describe, expect, it } from "vitest";
import { backoffDelayMs, isLowPriorityUrl } from "../src/map.js";

describe("isLowPriorityUrl", () => {
  it("flags docs/legal/blog pages by pathname", () => {
    for (const u of [
      "https://x.com/docs",
      "https://x.com/doc/getting-started",
      "https://x.com/blog/hello",
      "https://x.com/legal/privacy",
      "https://x.com/terms",
      "https://x.com/policies",
      "https://x.com/changelog",
      "https://x.com/cookie-policy",
      "https://x.com/impressum",
      "https://x.com/en/imprint",
    ]) {
      expect(isLowPriorityUrl(u), u).toBe(true);
    }
  });

  it("leaves product pages in the main queue", () => {
    for (const u of [
      "https://x.com/",
      "https://x.com/dashboard",
      "https://x.com/app/settings",
      "https://x.com/pricing",
      "https://x.com/documentation", // "doc" without a word boundary must not match
    ]) {
      expect(isLowPriorityUrl(u), u).toBe(false);
    }
  });

  it("returns false for an unparseable URL", () => {
    expect(isLowPriorityUrl("not a url")).toBe(false);
  });
});

describe("backoffDelayMs", () => {
  it("jumps from no delay to the initial backoff", () => {
    expect(backoffDelayMs(0)).toBe(2000);
  });

  it("doubles on repeated 429s", () => {
    expect(backoffDelayMs(2000)).toBe(4000);
    expect(backoffDelayMs(4000)).toBe(8000);
  });

  it("caps at the maximum delay", () => {
    expect(backoffDelayMs(8000)).toBe(15000);
    expect(backoffDelayMs(15000)).toBe(15000);
  });
});
