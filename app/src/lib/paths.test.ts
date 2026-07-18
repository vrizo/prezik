import { describe, expect, it } from "vitest";
import { parseRoute, runPath } from "./paths";

describe("parseRoute", () => {
  it("routes / to the start screen", () => {
    expect(parseRoute("/")).toEqual({ screen: "start" });
  });

  it("routes /run/:id to the run screen with the id", () => {
    expect(parseRoute("/run/abc123")).toEqual({ screen: "run", runId: "abc123" });
  });

  it("round-trips through runPath", () => {
    expect(parseRoute(runPath("xyz"))).toEqual({ screen: "run", runId: "xyz" });
  });
});
