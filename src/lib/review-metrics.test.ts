import { describe, it, expect } from "vitest";
import {
  starBreakdown,
  removalBand,
  removalSummary,
  parseBulkInput,
  csvCell,
} from "./review-metrics";
import { unsupportedLegalReview } from "./legal-analysis";
import type { AnalyzedReview } from "./data";
import type { RemovalPrediction } from "./removal-prediction";
const review = { id: "00000000-0000-4000-8000-000000000001" } as AnalyzedReview;
const prediction = (probability: number): RemovalPrediction => ({
  version: "history-cohort-v1",
  status: "estimated",
  probability,
  interval: [probability, probability],
  sample_size: 30,
  approved: Math.round((probability * 30) / 100),
  median_days: 4,
  basis: [],
  unavailable: [],
  generated_at: new Date().toISOString(),
});

describe("Fetched star metrics and outcome-cohort removal bands", () => {
  it("counts only fetched stars including absent buckets", () =>
    expect(
      starBreakdown([{ rating: 1 }, { rating: 1 }, { rating: 1 }, { rating: 4 }, { rating: 2 }]),
    ).toEqual([3, 1, 0, 1, 0]));
  it.each([
    [0, "low"],
    [39, "low"],
    [40, "medium"],
    [69, "medium"],
    [70, "high"],
    [100, "high"],
  ])("uses exact threshold %s", (score, band) =>
    expect(
      removalBand({
        ...unsupportedLegalReview(review),
        violates_policy: true,
        removal_likelihood: Number(score),
        prediction: prediction(Number(score)),
      }),
    ).toBe(band),
  );
  it("does not present an uncalibrated model score as a removal estimate", () =>
    expect(removalBand({ ...unsupportedLegalReview(review), removal_likelihood: 100 })).toBe(
      "not_estimable",
    ));
  it("includes reviews without cohort data as not estimable", () =>
    expect(
      removalSummary(
        [{ ...unsupportedLegalReview(review), violates_policy: true, removal_likelihood: 80 }],
        5,
      ),
    ).toEqual({ high: 0, medium: 0, low: 0, notEstimable: 5 }));
  it("supports 100+ name/URL lines without stripping commas in business addresses", () => {
    const text = Array.from({ length: 150 }, (_, index) => `Business ${index}, City`).join("\n");
    expect(parseBulkInput(text).valid).toHaveLength(150);
    expect(parseBulkInput("The Hudson, Albany\nThe Hudson, Albany\nab").duplicates).toHaveLength(1);
    expect(parseBulkInput("The Hudson, Albany").valid[0]).toBe("The Hudson, Albany");
  });
  it("neutralizes CSV formulas and escapes quotes", () => {
    expect(csvCell("=cmd()")).toBe(`"'=cmd()"`);
    expect(csvCell('unit "name"')).toBe('"unit ""name"""');
  });
  it("preserves case-sensitive URL paths and place IDs when deduplicating", () => {
    expect(
      parseBulkInput("https://goo.gl/maps/AbC\nhttps://goo.gl/maps/abc\nThe Hudson\nTHE HUDSON")
        .valid,
    ).toEqual(["https://goo.gl/maps/AbC", "https://goo.gl/maps/abc", "The Hudson"]);
  });
});
