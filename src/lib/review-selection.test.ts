import { describe, expect, it } from "vitest";
import { reviewGoogleLink, validateSelectionOutput, selectedPdfUrl } from "./review-selection";
import type { AnalyzedReview } from "./data";
const id = "6736a5be-e460-4e01-bfed-839fcd714877";
const review: AnalyzedReview = {
  id,
  author: "Unit Reviewer",
  rating: 1,
  text: "Visit my website for discounts",
  review_uri: null,
  published_at: null,
  relative_time: null,
  analysis: {
    risk: "requires_review",
    category: null,
    reason: null,
    evidence: null,
    confidence: 0,
    signals: [],
    model: null,
  },
};
const request = {
  review_id: id,
  assessment: "supported_policy_concern",
  policy: "Spam",
  evidence: "Visit my website",
  request_text: "Please assess this quoted promotional content.",
  policy_reference: "https://support.google.com/contributionpolicy/answer/7400114",
};
describe("Manual selection evidence safety", () => {
  it("only exposes valid unexpired saved selected PDF URLs", () => {
    const metadata = {
      selected_pdf_url: `https://ratingguard.online/reports/${id}_selected.pdf`,
      selected_saved_at: new Date().toISOString(),
    };
    expect(selectedPdfUrl(metadata)).toBe(metadata.selected_pdf_url);
    expect(
      selectedPdfUrl({
        ...metadata,
        selected_saved_at: new Date(Date.now() - 90 * 86400000).toISOString(),
      }),
    ).toBeNull();
    expect(selectedPdfUrl({ ...metadata, selected_pdf_url: "javascript:alert(1)" })).toBeNull();
  });
  it("does not turn a selected 1-star unresolved review into a violation", () => {
    const output = validateSelectionOutput({ requests: [request] }, [review]);
    expect(output[0]?.assessment).toBe("insufficient_evidence");
    expect(output[0]?.request_text).toContain("not proof");
  });
  it("retains a policy concern only with a supported risk and exact evidence", () => {
    const flagged = { ...review, analysis: { ...review.analysis!, risk: "high" as const } };
    expect(validateSelectionOutput({ requests: [request] }, [flagged])[0]?.assessment).toBe(
      "supported_policy_concern",
    );
    expect(
      validateSelectionOutput({ requests: [{ ...request, evidence: "fabricated phrase" }] }, [
        flagged,
      ])[0]?.assessment,
    ).toBe("insufficient_evidence");
  });
  it("requires the exact selected count and IDs", () => {
    expect(() => validateSelectionOutput({ requests: [request, request] }, [review])).toThrow(
      "exactly one",
    );
    expect(() =>
      validateSelectionOutput(
        { requests: [{ ...request, review_id: "b8c10010-0e10-487f-a50f-61c8cb1276d4" }] },
        [review],
      ),
    ).toThrow("exactly one");
  });
  it("labels fallback links honestly and preserves original URLs", () => {
    expect(
      reviewGoogleLink(review, "Business", "https://maps.google.com/?cid=123").label,
    ).toContain("business Maps");
    expect(reviewGoogleLink(review, "Business", null).label).toContain("not a direct");
    expect(
      reviewGoogleLink(
        { ...review, review_uri: "https://www.google.com/maps/reviews/unit" },
        "Business",
        null,
      ).url,
    ).toBe("https://www.google.com/maps/reviews/unit");
  });
});
