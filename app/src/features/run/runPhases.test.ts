import { describe, expect, it } from "vitest";
import type { Storyboard } from "@prezik/shared";
import {
  currentSceneIndex,
  failedStep,
  latestEventUrl,
  pageEstimate,
  pathOf,
  stepOf,
  stepStates,
} from "./runPhases";

describe("stepOf", () => {
  it("maps early statuses to explore", () => {
    expect(stepOf("created")).toBe("explore");
    expect(stepOf("exploring")).toBe("explore");
  });

  it("maps planning to plan and recording/uploading/done to record", () => {
    expect(stepOf("planning")).toBe("plan");
    expect(stepOf("recording")).toBe("record");
    expect(stepOf("uploading")).toBe("record");
    expect(stepOf("done")).toBe("record");
  });

  it("uses the failed-at fallback for terminal mid-flight states", () => {
    expect(stepOf("failed", "explore")).toBe("explore");
    expect(stepOf("needs_credentials", "plan")).toBe("plan");
    expect(stepOf("failed")).toBe("record");
  });
});

describe("stepStates", () => {
  it("marks earlier steps done, the current active, later locked", () => {
    expect(stepStates("plan")).toEqual({ explore: "done", plan: "active", record: "locked" });
  });

  it("locks everything after explore at the start", () => {
    expect(stepStates("explore")).toEqual({ explore: "active", plan: "locked", record: "locked" });
  });

  it("marks everything before record done at the end", () => {
    expect(stepStates("record")).toEqual({ explore: "done", plan: "done", record: "active" });
  });
});

describe("failedStep", () => {
  it("returns record whenever a storyboard exists", () => {
    expect(failedStep([{ agent: "scout", level: "error" }], true)).toBe("record");
    expect(failedStep([], true)).toBe("record");
  });

  it("returns explore without a storyboard or director activity", () => {
    expect(failedStep([{ agent: "scout", level: "error" }], false)).toBe("explore");
    expect(failedStep([{ agent: "mapper", level: "error" }], false)).toBe("explore");
  });

  it("ignores the erroring agent name — the recorder reports as presenter during the map crawl", () => {
    expect(
      failedStep(
        [
          { agent: "mapper", level: "info" },
          { agent: "presenter", level: "error" },
        ],
        false,
      ),
    ).toBe("explore");
  });

  it("returns plan when the director was active but produced no storyboard", () => {
    expect(
      failedStep(
        [
          { agent: "scout", level: "info" },
          { agent: "director", level: "error" },
        ],
        false,
      ),
    ).toBe("plan");
  });
});

describe("pageEstimate", () => {
  it("counts the union of read urls and their links, normalizing paths", () => {
    const count = pageEstimate([
      { url: "https://acme.app/", linksTo: ["https://acme.app/dashboard", "/pricing"] },
      { url: "https://acme.app/dashboard/", linksTo: ["/pricing/"] },
    ]);
    // paths: "/", "/dashboard", "/pricing" -> 3 distinct
    expect(count).toBe(3);
  });

  it("returns 0 for an empty crawl", () => {
    expect(pageEstimate([])).toBe(0);
  });
});

const storyboard: Storyboard = {
  targetUrl: "https://acme.app",
  productName: "Acme",
  tagline: "t",
  language: "en",
  intro: { narration: "hi" },
  scenes: [
    { id: "s1", title: "One", narration: "a", actions: [] },
    { id: "s2", title: "Two", narration: "b", actions: [] },
  ],
  outro: { narration: "bye" },
};

describe("currentSceneIndex", () => {
  it("returns null without a storyboard", () => {
    expect(currentSceneIndex([{ sceneId: "s1" }], null)).toBeNull();
  });

  it("returns the index of the last event's sceneId", () => {
    expect(currentSceneIndex([{ sceneId: "s1" }, { sceneId: "s2" }], storyboard)).toBe(1);
  });

  it("returns null when no event references a scene", () => {
    expect(currentSceneIndex([{}, {}], storyboard)).toBeNull();
  });

  it("returns null for an unknown sceneId", () => {
    expect(currentSceneIndex([{ sceneId: "missing" }], storyboard)).toBeNull();
  });
});

describe("pathOf / latestEventUrl", () => {
  it("extracts the path from a url", () => {
    expect(pathOf("https://acme.app/invoices/new")).toBe("/invoices/new");
    expect(pathOf(null)).toBe("");
  });

  it("returns the last event url, skipping ones without one", () => {
    expect(latestEventUrl([{ url: "https://a/1" }, {}, { url: "https://a/2" }])).toBe("https://a/2");
    expect(latestEventUrl([{}])).toBeNull();
  });
});
