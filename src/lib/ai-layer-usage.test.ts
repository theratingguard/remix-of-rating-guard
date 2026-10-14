import { describe, expect, it } from "vitest";
import { estimateAiSavingsPercent, summarizeAiLayerUsage } from "./ai-layer-usage";

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

  it("summarizes per-layer cost and average/latest scan cost", () => {
    const summary = summarizeAiLayerUsage(
      [
        {
          scan_id: "scan-1",
          layer: "rules",
          duration_ms: 20,
          cost_usd: 0,
          created_at: "2026-10-14T08:00:00.000Z",
        },
        {
          scan_id: "scan-1",
          layer: "gpt",
          duration_ms: 1200,
          cost_usd: 0.01,
          created_at: "2026-10-14T08:01:00.000Z",
        },
        {
          scan_id: "scan-2",
          layer: "ollama",
          duration_ms: 9000,
          cost_usd: 0,
          created_at: "2026-10-14T09:00:00.000Z",
        },
      ],
      "2026-10-14T00:00:00.000Z",
    );

    expect(summary.today_cases).toBe(3);
    expect(summary.month_cases).toBe(3);
    expect(summary.month_cost_usd).toBe(0.01);
    expect(summary.month_scan_count).toBe(2);
    expect(summary.month_avg_cost_per_scan_usd).toBe(0.005);
    expect(summary.latest_scan_cost_usd).toBe(0);
    expect(summary.latest_scan_cases).toBe(1);
    expect(summary.layers.map(({ layer, cases, cost_usd }) => [layer, cases, cost_usd])).toEqual([
      ["rules", 1, 0],
      ["ollama", 1, 0],
      ["gpt", 1, 0.01],
    ]);
  });

  it("returns zero per-scan amounts for empty usage", () => {
    const summary = summarizeAiLayerUsage([], "2026-10-14T00:00:00.000Z");

    expect(summary.month_scan_count).toBe(0);
    expect(summary.month_avg_cost_per_scan_usd).toBe(0);
    expect(summary.latest_scan_cost_usd).toBe(0);
    expect(summary.latest_scan_cases).toBe(0);
  });
});
