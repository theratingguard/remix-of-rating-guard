import { describe, expect, it } from "vitest";
import { estimateAiSavingsPercent } from "./ai-layer-usage";

describe("estimated AI savings", () => {
  it("compares actual cost with the GPT-only baseline for the same case count", () => {
    expect(estimateAiSavingsPercent(100, 0.05)).toBeCloseTo(95);
  });

  it("returns no percentage when there are no cases", () => {
    expect(estimateAiSavingsPercent(0, 0)).toBeNull();
  });

  it("does not report negative savings when actual cost exceeds baseline", () => {
    expect(estimateAiSavingsPercent(2, 0.03)).toBe(0);
  });
});
