import { describe, it, expect } from "vitest";
import { buildSmartAlerts, compareBusinesses, alertsSampleSchema } from "./smart-alerts";
const sample = {
  generated_at: "2026-01-07T09:00:00Z",
  since: "2026-01-01T09:00:00Z",
  reviews: [],
  outcomes: [],
  approved_this_week: 0,
  rejected_this_week: 0,
};
describe("Source-grounded Smart Alerts", () => {
  it("handles no records without invented percentages or pending success", () => {
    expect(buildSmartAlerts(sample)).toMatchObject({
      sampleSize: 0,
      flagged: 0,
      trends: [],
      weekly: { decidedSuccessPercent: null },
    });
  });
  it("uses flagged denominator for policy trends and excludes negative-only reviews", () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      id: String(index),
      author: "Name",
      rating: 1,
      text: null,
      published_at: "2026-01-07T00:00:00Z",
      scan_id: "scan",
      business_id: "business",
      business_name: "Cafe",
      fetched_at: sample.generated_at,
      risk: index < 5 ? "high" : "normal",
      category: index < 2 ? "Spam" : "Fake Content",
      business_type: "Cafe",
    }));
    const result = buildSmartAlerts({ ...sample, reviews: rows });
    expect(result.flagged).toBe(5);
    expect(result.trends.find((row) => row.policy === "Spam")?.percent).toBe(40);
    expect(result.today).toEqual({ sampleSize: 10, flagged: 5 });
    expect(result.businessTrends.find((row) => row.policy === "Spam")).toMatchObject({
      count: 2,
      total: 5,
      percent: 40,
    });
  });
  it("reports only matching text patterns in the same fetched business sample", () => {
    const row = {
      id: "1",
      author: "Name",
      rating: 1,
      text: "This is matching review text in the source sample",
      published_at: null,
      scan_id: "scan",
      business_id: "b",
      business_name: "Cafe",
      fetched_at: sample.generated_at,
      risk: "normal",
      category: null,
      business_type: null,
    };
    const result = buildSmartAlerts({
      ...sample,
      reviews: [row, { ...row, id: "2" }, { ...row, id: "3", scan_id: "another" }],
    });
    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0]).toContain("not proof");
  });
  it("compares explicitly selected known counts using competitor denominator", () => {
    const own = { id: "1", name: "Own", total_reviews: 50, rating: 4 };
    const competitor = { id: "2", name: "Competitor", total_reviews: 100, rating: 4.5 };
    expect(compareBusinesses(own, competitor).shortfall).toBe(50);
    expect(compareBusinesses({ ...own, total_reviews: null }, competitor).shortfall).toBeNull();
    expect(compareBusinesses(own, { ...competitor, total_reviews: 0 }).shortfall).toBeNull();
    expect(() => compareBusinesses(own, own)).toThrow("different");
    expect(() => alertsSampleSchema.parse({ ...sample, approved_this_week: -1 })).toThrow();
  });
});
