// Client-safe action-center vocabulary and the explainable recommendation engine.
export const ACTION_STATUSES = [
  "NOT_REVIEWED", "REVIEWED", "ACTION_RECOMMENDED", "GOOGLE_REPORTING_PATH_AVAILABLE", "USER_ACTION_PENDING", "RESOLVED", "NOT_ACTIONABLE",
] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const ACTION_LABEL: Record<ActionStatus, string> = {
  NOT_REVIEWED: "Not reviewed", REVIEWED: "Reviewed", ACTION_RECOMMENDED: "Action recommended",
  GOOGLE_REPORTING_PATH_AVAILABLE: "Google reporting path available", USER_ACTION_PENDING: "User action pending",
  RESOLVED: "Resolved", NOT_ACTIONABLE: "Not actionable",
};

/** Explainable next step derived from the stored category, signals and confidence. */
export function recommend(input: { risk: string; category: string | null; signals: string[] | null; confidence: number; hasLink: boolean }) {
  const text = `${input.category ?? ""} ${(input.signals ?? []).join(" ")}`.toLowerCase();
  let kind = "Potential policy risk";
  if (/spam|promot|advert|link/.test(text)) kind = "Potential spam / promotional content";
  else if (/abus|harass|hate|offens|profan|threat/.test(text)) kind = "Potentially abusive content";
  else if (/conflict|competitor|employee|owner/.test(text)) kind = "Potential conflict of interest";
  else if (/personal|private|phone|address/.test(text)) kind = "Contains personal information";
  else if (/off-topic|irrelevant|not based|fake|decept/.test(text)) kind = "Possibly not based on a real experience";
  const low = input.confidence < 60;
  const next = low
    ? "Low confidence — read the review yourself before taking any action. It may be genuine negative feedback."
    : input.hasLink
      ? "If you agree it breaks Google policy, open the review on Google and use “Report review”. Keep the evidence shown here."
      : "Find the review on the business's Google profile, then use Google's official “Report review” option.";
  return { kind, next, why: `Flagged ${input.risk} risk at ${input.confidence}% confidence based on: ${(input.signals ?? []).join(", ") || input.category || "model assessment"}.` };
}
