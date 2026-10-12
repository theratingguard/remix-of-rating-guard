import { contextual, observed } from "./checks";
import type { RuleCheck, RuleReviewContext } from "./types";

export const EVIDENCE_RULE_CATALOG = [
  "evidence-named-person",
  "evidence-exact-date",
  "evidence-specific-amount",
  "evidence-photo-or-receipt",
  "evidence-vague-or-hearsay",
] as const;

export function evaluateEvidenceRules(input: RuleReviewContext): RuleCheck[] {
  const names = input.context?.exactNames;
  const dates = input.context?.exactDates;
  const amounts = input.context?.exactAmounts;
  const vague = input.context?.explicitlyVagueTiming;
  const hearsay = input.context?.hearsayOnly;
  const noDetails =
    input.context?.explicitlyVagueTiming === true || input.context?.hearsayOnly === true;
  const detailsProvided =
    names?.length || dates?.length || amounts?.length || input.context?.photoOrReceiptAvailable;

  return [
    contextual(
      "evidence-named-person",
      "semantic",
      names ? names.length > 0 : null,
      `Supplied named-person references: ${names?.join(", ") || "none"}.`,
    ),
    contextual(
      "evidence-exact-date",
      "semantic",
      dates ? dates.length > 0 : null,
      `Supplied exact dates: ${dates?.join(", ") || "none"}.`,
    ),
    contextual(
      "evidence-specific-amount",
      "semantic",
      amounts ? amounts.length > 0 : null,
      `Supplied amounts: ${amounts?.join(", ") || "none"}.`,
    ),
    contextual(
      "evidence-photo-or-receipt",
      "semantic",
      input.context?.photoOrReceiptAvailable ?? null,
      "A photo or receipt was explicitly recorded as available; verify it is authentic and relevant.",
    ),
    observed(
      "evidence-vague-or-hearsay",
      "semantic",
      vague === undefined && hearsay === undefined
        ? null
        : Boolean(vague || hearsay) && !detailsProvided,
      1,
      noDetails
        ? "Review context explicitly identifies vague timing or hearsay without supplied corroborating material; this is not proof of a false review."
        : "No explicit vague-timing/hearsay-only indicator was supplied.",
    ),
  ];
}
