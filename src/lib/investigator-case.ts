export type InvestigatorReplyStatus = "removed" | "rejected" | "pending" | "need_evidence";

export type InvestigatorReplyAnalysis = {
  status: InvestigatorReplyStatus;
  next_step: string;
  reasoning: string;
};

export function explicitlyConfirmsReviewRemoval(reply: string): boolean {
  const normalized = reply.trim().toLocaleLowerCase();
  const removalMention =
    /\b(?:review|content|post)\b.{0,80}\b(?:removed|taken down)\b/.test(normalized) ||
    /\b(?:removed|taken down)\b.{0,80}\b(?:review|content|post)\b/.test(normalized);
  const negatedRemoval =
    /\b(?:not|never|no|cannot|can't|could not|couldn't|unable to|will not|won't)\b.{0,50}\b(?:remove|removed|take down|taken down)\b/.test(
      normalized,
    );
  return removalMention && !negatedRemoval;
}

export function prepareInvestigatorReport(input: {
  businessName: string;
  reviewText: string;
  reviewUrl: string;
  policyAngle: string | null;
  evidence: string | null;
  reason: string | null;
}) {
  const evidence = input.evidence?.trim() ?? "";
  const hasVerifiableQuote = evidence.length > 0 && input.reviewText.includes(evidence);
  const policy = input.policyAngle?.trim() || "policy concern requiring review";
  if (!hasVerifiableQuote) {
    return {
      policyAngle: policy,
      evidenceNotes:
        "No exact, verifiable quote is available. Do not submit until evidence is reviewed.",
      reportText:
        "Evidence review required. This case does not contain an exact quote verified against the source review. Do not submit an allegation until accurate, relevant evidence is added.",
    };
  }
  return {
    policyAngle: policy,
    evidenceNotes: `Exact review quote: “${evidence}”${input.reason?.trim() ? `\nExisting analysis: ${input.reason.trim()}` : ""}`,
    reportText: [
      `Please review this content on ${input.businessName}'s Google Maps listing under the policy area "${policy}".`,
      `Review URL: ${input.reviewUrl}`,
      `Relevant text from the review: “${evidence}”`,
      input.reason?.trim()
        ? `Reason this may warrant review: ${input.reason.trim()}`
        : "Please assess the quoted content against the applicable Google Maps user-contributed content policies.",
      "This request reports a concern for Google's independent assessment. It does not assert facts beyond the cited review text or ask Google to remove content solely because it is negative.",
    ].join("\n\n"),
  };
}

export function analyzeReplyWithRules(reply: string): InvestigatorReplyAnalysis {
  const normalized = reply.trim().toLocaleLowerCase();
  if (explicitlyConfirmsReviewRemoval(normalized)) {
    return {
      status: "removed",
      next_step:
        "Verify the review is no longer visible on Google Maps before marking the case closed.",
      reasoning:
        "The reply explicitly says the review or content was removed; verify the outcome independently.",
    };
  }
  if (/\b(more evidence|additional evidence|provide evidence|need evidence)\b/.test(normalized)) {
    return {
      status: "need_evidence",
      next_step:
        "Gather only authentic, relevant supporting evidence and respond through Google's official channel.",
      reasoning: "The reply asks for additional evidence.",
    };
  }
  if (
    /\b(under review|still reviewing|reviewing your report|investigat(?:ing|ion) in progress)\b/.test(
      normalized,
    )
  ) {
    return {
      status: "pending",
      next_step: "Wait for Google's response and check the official support channel later.",
      reasoning: "The reply indicates the request is still being reviewed.",
    };
  }
  if (
    /\b(no policy violation|does not violate|doesn't violate|not violate|does not meet our policy)\b/.test(
      normalized,
    )
  ) {
    return {
      status: "rejected",
      next_step:
        "Review the stated reason and any new, verifiable evidence before deciding whether an appeal is appropriate.",
      reasoning: "The reply says Google did not find a policy violation.",
    };
  }
  if (/\b(duplicate|already submitted|previously reported)\b/.test(normalized)) {
    return {
      status: "rejected",
      next_step:
        "Check the original request and use its existing case reference; do not resubmit the same request as a new case.",
      reasoning: "The reply indicates that the request or report is a duplicate.",
    };
  }
  return {
    status: "pending",
    next_step:
      "Review the original Google message manually; this reply did not match a supported outcome phrase.",
    reasoning: "No clear decision or evidence request could be identified from the pasted text.",
  };
}
