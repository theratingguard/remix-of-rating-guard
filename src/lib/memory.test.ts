import { describe, expect, it } from "vitest";
import { learningPatterns, memoryPrediction, similarMemoryCases, type MemoryCase } from "./memory";

const review = {
  review_id: "00000000-0000-4000-8000-000000000099",
  business_type: "Hotel",
  policy_type: "Spam",
  evidence_strength: 80,
  review_text: "Visit our website for discounts",
  supported: true,
};
const rows = (n: number): MemoryCase[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    review_id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    business_type: "Hotel",
    policy_type: "Spam",
    evidence_strength: 85,
    evidence_pattern: "Visit our website",
    review_text: review.review_text,
    outcome: i < 8 ? "approved" : "rejected",
    days_to_response: 3,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-02T00:00:00Z",
  }));
describe("case memory", () => {
  it("requires ten comparable decided cases and evidence", () => {
    expect(memoryPrediction(review, rows(9)).removal_likelihood).toBeNull();
    expect(
      memoryPrediction({ ...review, supported: false }, rows(10)).removal_likelihood,
    ).toBeNull();
    expect(
      memoryPrediction({ ...review, evidence_strength: null }, rows(10)).removal_likelihood,
    ).toBeNull();
  });
  it("returns measured output and bounded Wilson interval at ten cases", () => {
    const result = memoryPrediction(review, rows(10));
    expect(result.removal_likelihood).toBe(80);
    expect(result.sample_size).toBe(10);
    expect(result.confidence_interval?.[0]).toBeLessThan(80);
    expect(result.confidence_interval?.[1]).toBeGreaterThan(80);
    expect(result.similar_cases).toHaveLength(10);
  });
  it("excludes pending, duplicate, current, future and incompatible cases", () => {
    const sample = rows(10);
    sample.push(
      { ...sample[0]!, outcome: "pending" },
      { ...sample[0]!, review_id: review.review_id },
      { ...sample[0]!, review_id: "future", updated_at: "2099-01-01T00:00:00Z" },
      { ...sample[0]!, review_id: "other", business_type: "Cafe" },
    );
    expect(memoryPrediction(review, sample).sample_size).toBe(10);
  });
  it("similar cases are deterministically ranked and capped at ten", () => {
    const result = similarMemoryCases(review, rows(20));
    expect(result).toHaveLength(10);
    expect(result[0]?.similarity).toBeGreaterThan(0.9);
    expect(similarMemoryCases(review, rows(20))).toEqual(result);
  });
  it("learning only uses sufficiently sized decided cohorts", () => {
    expect(learningPatterns(rows(9))).toEqual([]);
    expect(learningPatterns(rows(10))[0]).toMatchObject({ total: 10, approved: 8 });
    expect(learningPatterns(rows(10).map((row) => ({ ...row, outcome: "pending" })))).toEqual([]);
  });
});
