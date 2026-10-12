export type QualityBoosterStatus = "available" | "limited" | "unavailable";

export type QualityBooster = {
  id: string;
  name: string;
  status: QualityBoosterStatus;
  scope: string;
};

export const QUALITY_BOOSTERS: readonly QualityBooster[] = [
  {
    id: "confidence-calibration",
    name: "Confidence calibration",
    status: "unavailable",
    scope: "No representative, independently verified holdout set or calibration curve.",
  },
  {
    id: "cross-model-voting",
    name: "Cross-model voting",
    status: "limited",
    scope: "Enabled for configured multi-model AI analyses, not every rules-only result.",
  },
  {
    id: "reviewer-reputation",
    name: "Reviewer reputation",
    status: "limited",
    scope: "Uses only explicitly supplied profile aggregates; no identity or network inference.",
  },
  {
    id: "business-verification",
    name: "Business verification",
    status: "unavailable",
    scope: "No trusted business-verification signal is available to the scan pipeline.",
  },
  {
    id: "evidence-strength",
    name: "Evidence strength",
    status: "available",
    scope: "Evidence readiness is assessed separately; it is not a removal probability.",
  },
  {
    id: "time-decay",
    name: "Time-decay weighting",
    status: "unavailable",
    scope: "Signals are not time-decay weighted or trained against verified outcomes.",
  },
  {
    id: "language-specific-rules",
    name: "Language-specific rules",
    status: "limited",
    scope:
      "Script checks are heuristic; full language detection and localized policy rules are absent.",
  },
  {
    id: "platform-specific-rules",
    name: "Platform-specific rules",
    status: "limited",
    scope:
      "Current scan evidence is Google-focused; cross-platform rules are unassessed without data.",
  },
  {
    id: "industry-specific-patterns",
    name: "Industry-specific patterns",
    status: "unavailable",
    scope: "No validated industry-specific rule sets are configured.",
  },
  {
    id: "legal-outcome-feedback",
    name: "Legal outcome feedback",
    status: "limited",
    scope: "Entered outcomes can inform case context; they do not train or calibrate predictions.",
  },
];

export function summarizeQualityBoosters(boosters: readonly QualityBooster[] = QUALITY_BOOSTERS) {
  return boosters.reduce(
    (summary, booster) => {
      summary[booster.status]++;
      return summary;
    },
    { available: 0, limited: 0, unavailable: 0 },
  );
}
