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
const review = { id: "00000000-0000-4000-8000-000000000001" } as AnalyzedReview;
describe("Fetched star metrics and advisory removal bands", () => {
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
      }),
    ).toBe(band),
  );
  it("never upgrades unsupported reviews even with a high advisory score", () =>
    expect(removalBand({ ...unsupportedLegalReview(review), removal_likelihood: 100 })).toBe(
      "low",
    ));
  it("includes unassessed reviews as low/not estimable", () =>
    expect(
      removalSummary(
        [{ ...unsupportedLegalReview(review), violates_policy: true, removal_likelihood: 80 }],
        5,
      ),
    ).toEqual({ high: 1, medium: 0, low: 4 }));
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
