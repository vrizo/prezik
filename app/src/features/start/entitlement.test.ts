import { describe, expect, it } from "vitest";
import { canStartRun } from "./entitlement";

describe("canStartRun", () => {
  it("is false with zero credits", () => {
    expect(canStartRun(0)).toBe(false);
  });

  it("is true with at least one credit", () => {
    expect(canStartRun(1)).toBe(true);
    expect(canStartRun(3)).toBe(true);
  });
});
