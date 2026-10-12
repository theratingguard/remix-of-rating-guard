import { describe, it, expect } from "vitest";
import { predictRemoval, predictionBand, type HistoryCase } from "./removal-prediction";
const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const input = {
  policy_type: "Spam",
  business_type: "Cafe",
  evidence_strength: 50,
  supported: true,
  review_id: uuid(999),
};
function cases(n: number, approved = 26): HistoryCase[] {
  return Array.from({ length: n }, (_, index) => ({
    id: uuid(index),
    review_id: uuid(index),
    policy_type: "Spam",
    business_type: "Cafe",
    evidence_strength: 50,
    outcome: index < approved ? "approved" : "rejected",
    days_to_response: index + 1,
    created_at: "2026-01-01T00:00:00Z",
  }));
}
describe("Evidence-grounded historical predictions", () => {
  it("never invents probability in cold-start or insufficient data", () => {
    expect(predictRemoval(input, []).probability).toBeNull();
    expect(predictRemoval(input, cases(9)).status).toBe("not_estimable");
    expect(predictRemoval(input, cases(10)).status).toBe("low_confidence");
    expect(predictRemoval(input, cases(29)).status).toBe("low_confidence");
    expect(predictRemoval(input, cases(29)).probability).toBeNull();
  });
  it("calculates an 87% cohort estimate with support and uncertainty, not model memory", () => {
    const result = predictRemoval(input, cases(30));
    expect(result.probability).toBe(87);
    expect(result.interval).toEqual([70, 95]);
    expect(result.median_days).toBe(15.5);
    expect(result.basis.join(" ")).toContain("26/30");
  });
  it("requires matching policy, business type and evidence band; unknown inputs unavailable", () => {
    expect(predictRemoval({ ...input, business_type: "Hotel" }, cases(30)).sample_size).toBe(0);
    expect(predictRemoval({ ...input, policy_type: "Fake Content" }, cases(30)).sample_size).toBe(
      0,
    );
    expect(predictRemoval({ ...input, evidence_strength: 80 }, cases(30)).probability).toBeNull();
    expect(predictRemoval({ ...input, evidence_strength: null }, cases(30)).probability).toBeNull();
  });
  it("excludes the current review, duplicates and future cases", () => {
    const rows = cases(30);
    expect(predictRemoval({ ...input, review_id: uuid(0) }, rows).sample_size).toBe(29);
    expect(predictRemoval(input, [...rows, ...rows]).sample_size).toBe(30);
    expect(
      predictRemoval(
        input,
        rows.map((row) => ({ ...row, created_at: "2999-01-01T00:00:00Z" })),
      ).probability,
    ).toBeNull();
  });
  it("does not predict unsupported evidence or accept invalid strength", () => {
    expect(predictRemoval({ ...input, supported: false }, cases(30)).status).toBe("unsupported");
    expect(() => predictRemoval({ ...input, evidence_strength: NaN }, cases(30))).toThrow();
  });
  it.each([
    [0, "Low"],
    [39, "Low"],
    [40, "Medium"],
    [59, "Medium"],
    [60, "High"],
    [79, "High"],
    [80, "Very high"],
    [100, "Very high"],
  ])("uses exact probability threshold %s", (score, label) => {
    expect(predictionBand(Number(score)).label).toContain(String(label));
  });
});
