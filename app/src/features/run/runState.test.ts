import { describe, expect, it } from "vitest";
import { deriveAgentStates, latestUrl } from "./runState";

describe("deriveAgentStates", () => {
  it("marks agents idle before they have any events", () => {
    const states = deriveAgentStates([], "created");
    expect(states.every((s) => s.state === "idle")).toBe(true);
  });

  it("marks scout and mapper working during exploring, director/presenter idle", () => {
    const states = deriveAgentStates(
      [
        { agent: "scout", level: "info", message: "searching the web" },
        { agent: "mapper", level: "info", message: "asked the browser to start crawling" },
      ],
      "exploring",
    );
    const byAgent = Object.fromEntries(states.map((s) => [s.agent, s]));
    expect(byAgent.scout.state).toBe("working");
    expect(byAgent.mapper.state).toBe("working");
    expect(byAgent.director.state).toBe("idle");
    expect(byAgent.presenter.state).toBe("idle");
  });

  it("marks scout/mapper done and director working once status reaches planning", () => {
    const states = deriveAgentStates(
      [
        { agent: "scout", level: "info", message: "brief ready: ..." },
        { agent: "mapper", level: "info", message: "mapping done: 4 pages found" },
        { agent: "director", level: "info", message: "writing the storyboard" },
      ],
      "planning",
    );
    const byAgent = Object.fromEntries(states.map((s) => [s.agent, s]));
    expect(byAgent.scout.state).toBe("done");
    expect(byAgent.mapper.state).toBe("done");
    expect(byAgent.director.state).toBe("working");
  });

  it("does not mark presenter done when the run stops at needs_credentials", () => {
    const states = deriveAgentStates(
      [
        { agent: "scout", level: "info", message: "brief ready: ..." },
        { agent: "mapper", level: "info", message: "mapping done: 2 pages found" },
        { agent: "director", level: "info", message: "this product requires sign-in" },
      ],
      "needs_credentials",
    );
    const byAgent = Object.fromEntries(states.map((s) => [s.agent, s]));
    expect(byAgent.presenter.state).not.toBe("done");
  });

  it("a later agent's success does not erase an earlier agent's error", () => {
    const states = deriveAgentStates(
      [
        { agent: "scout", level: "error", message: "TAVILY_API_KEY is not set" },
        { agent: "mapper", level: "info", message: "mapping done: 4 pages found" },
      ],
      "failed",
    );
    const byAgent = Object.fromEntries(states.map((s) => [s.agent, s]));
    expect(byAgent.scout.state).toBe("error");
  });
});

describe("latestUrl", () => {
  it("returns the most recent event's url, skipping ones without one", () => {
    expect(
      latestUrl([{ url: "https://example.com/" }, { url: undefined }, { url: "https://example.com/pricing" }]),
    ).toBe("https://example.com/pricing");
  });

  it("returns null when no event has a url", () => {
    expect(latestUrl([{ url: undefined }])).toBeNull();
  });
});
