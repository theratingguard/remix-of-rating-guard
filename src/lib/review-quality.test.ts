import { describe, expect, it } from "vitest";
import { assessReviewQuality, collectSampleEvidence, readinessBand } from "./review-quality";
import { unsupportedLegalReview } from "./legal-analysis";
import { reviewQualityHtml } from "./report-pdf.server";
import type { AnalyzedReview } from "./data";
const review: AnalyzedReview = {
  id: "00000000-0000-4000-8000-000000000001",
  author: "Fixture",
  rating: 1,
  published_at: "2026-10-10T10:00:00Z",
  relative_time: null,
  text: "Buy our discount packages at spam.example",
  review_uri: null,
  analysis: null,
};
describe("Evidence-readiness and limited-sample collection", () => {
  it("never invents precedent, legal support or removal history", () => {
    const quality = assessReviewQuality(unsupportedLegalReview(review), review, [review]);
    expect(quality.total).toBe(0);
    expect(quality.assessed).toBe(2);
    expect(quality.components.slice(2).every((component) => component.score === null)).toBe(true);
  });
  it("scores a sourced policy quote only as partial evidence, not almost certain removal", () => {
    const legal = {
      ...unsupportedLegalReview(review),
      violates_policy: true,
      policy_section: "Advertising & solicitation",
      evidence_quote: "Buy our discount packages",
    };
    const quality = assessReviewQuality(legal, review, [review]);
    expect(quality.total).toBe(30);
    const html = reviewQualityHtml(quality);
    expect(html).toContain("30/100");
    expect(html).toContain("Not a removal probability");
    expect(html).toContain("Unavailable");
  });
  it("detects duplicates and dates only inside the fetched sample without alleging fake accounts", () => {
    const findings = collectSampleEvidence(review, [review, { ...review, id: "second" }]).join(" ");
    expect(findings).toContain("Matching normalized text");
    expect(findings).toContain("2 of 2 fetched reviews");
    expect(findings).toContain("not proof");
    expect(
      collectSampleEvidence({ ...review, published_at: "bad" }, [review]).join(" "),
    ).not.toContain("UTC");
  });
  it("uses precise readiness thresholds without calling them probabilities", () => {
    expect(readinessBand(49).label).toBe("Low readiness");
    expect(readinessBand(50).label).toBe("Medium readiness");
    expect(readinessBand(70).label).toBe("High readiness");
    expect(readinessBand(90).label).toBe("Very high readiness");
  });
});
