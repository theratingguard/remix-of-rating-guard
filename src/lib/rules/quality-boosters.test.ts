import { describe, expect, it } from "vitest";
import { QUALITY_BOOSTERS, summarizeQualityBoosters } from "./quality-boosters";

describe("rules quality booster inventory", () => {
  it("lists all ten boosters with transparent availability", () => {
    expect(QUALITY_BOOSTERS).toHaveLength(10);
    expect(new Set(QUALITY_BOOSTERS.map((booster) => booster.id)).size).toBe(10);
    expect(summarizeQualityBoosters()).toEqual({
      available: 1,
      limited: 5,
      unavailable: 4,
    });
  });

  it("does not claim calibration, verification, or time-decay without required data", () => {
    expect(
      QUALITY_BOOSTERS.filter((booster) =>
        ["confidence-calibration", "business-verification", "time-decay"].includes(booster.id),
      ).every((booster) => booster.status === "unavailable"),
    ).toBe(true);
  });
});
