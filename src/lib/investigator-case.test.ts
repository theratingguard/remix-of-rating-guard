import { describe, expect, it } from "vitest";
import {
  analyzeReplyWithRules,
  explicitlyConfirmsReviewRemoval,
  prepareInvestigatorReport,
} from "./investigator-case";

describe("investigator case evidence and reply triage", () => {
  it("creates a cautious report only around an exact quote present in source text", () => {
    const prepared = prepareInvestigatorReport({
      businessName: "Cafe North",
      reviewText: "The owner asked me to pay cash to delete my review.",
      reviewUrl: "https://www.google.com/maps/reviews/data=!1sreview",
      policyAngle: "Conflict of interest",
      evidence: "pay cash to delete my review",
      reason: "The reviewer describes an incentive for changing a review.",
    });
    expect(prepared.reportText).toContain("“pay cash to delete my review”");
    expect(prepared.reportText).toContain("independent assessment");
    expect(prepared.evidenceNotes).toContain("Exact review quote");
  });

  it("refuses a submission-ready draft when the evidence quote is not exact", () => {
    const prepared = prepareInvestigatorReport({
      businessName: "Cafe North",
      reviewText: "Bad service.",
      reviewUrl: "https://www.google.com/maps/reviews/data=!1sreview",
      policyAngle: "Fake content",
      evidence: "The review is fake",
      reason: "Unverified",
    });
    expect(prepared.reportText).toContain("Do not submit");
    expect(prepared.evidenceNotes).toContain("No exact");
  });

  it.each([
    ["This review has been removed.", "removed"],
    ["We found no policy violation.", "rejected"],
    ["Your report is under review.", "pending"],
    ["Please provide more evidence.", "need_evidence"],
  ] as const)("classifies a supported Google response", (reply, status) => {
    expect(analyzeReplyWithRules(reply).status).toBe(status);
  });

  it("does not treat unrelated uses of removed as proof of removal", () => {
    expect(analyzeReplyWithRules("The request was removed from the queue.").status).toBe("pending");
  });

  it("does not classify a negated removal statement as confirmed removal", () => {
    const reply = "We have not removed this review.";
    expect(explicitlyConfirmsReviewRemoval(reply)).toBe(false);
    expect(analyzeReplyWithRules(reply).status).toBe("pending");
  });

  it("classifies duplicate report responses as rejected", () => {
    expect(analyzeReplyWithRules("This report is a duplicate.").status).toBe("rejected");
  });
});
