import type { RuleCheck, RuleGroup, RuleGroupScore, RuleScore } from "./types";

export const RULE_GROUP_LIMITS: Record<RuleGroup, number> = {
  text: 30,
  reviewer: 25,
  temporal: 15,
  crossPlatform: 15,
  network: 10,
  semantic: 5,
  pattern: 0,
  language: 0,
};

export const RULE_GROUP_COUNTS: Record<RuleGroup, number> = {
  text: 100,
  reviewer: 75,
  temporal: 50,
  crossPlatform: 75,
  network: 50,
  semantic: 50,
  pattern: 50,
  language: 50,
};

export const RULE_GROUP_LABELS: Record<RuleGroup, string> = {
  text: "Text Forensics",
  reviewer: "Reviewer Forensics",
  temporal: "Temporal Forensics",
  crossPlatform: "Cross-Platform",
  network: "Network Forensics",
  semantic: "Semantic Forensics",
  pattern: "Pattern Signals (advisory)",
  language: "Language Signals (advisory)",
};

export const MICRO_RULE_CHECK_COUNT = Object.values(RULE_GROUP_COUNTS).reduce(
  (total, count) => total + count,
  0,
);

export function scoreRuleChecks(checks: RuleCheck[], durationMs: number): RuleScore {
  const groups = Object.fromEntries(
    Object.entries(RULE_GROUP_LIMITS).map(([name, maxScore]) => {
      const group = name as RuleGroup;
      const groupChecks = checks.filter((check) => check.group === group);
      const assessed = groupChecks.filter((check) => check.status !== "not_assessed");
      return [
        group,
        {
          score: Math.min(
            maxScore,
            groupChecks.reduce(
              (total, check) => total + (check.status === "flagged" ? check.points : 0),
              0,
            ),
          ),
          maxScore,
          checks: groupChecks.length,
          assessed: assessed.length,
          flagged: groupChecks.filter((check) => check.status === "flagged").length,
        } satisfies RuleGroupScore,
      ];
    }),
  ) as Record<RuleGroup, RuleGroupScore>;

  const score = Object.values(groups).reduce((total, group) => total + group.score, 0);
  return {
    score,
    band: score >= 80 ? "high" : score >= 60 ? "medium" : score >= 40 ? "low" : "normal",
    checksRun: checks.length,
    checksAssessed: checks.filter((check) => check.status !== "not_assessed").length,
    checksFlagged: checks.filter((check) => check.status === "flagged").length,
    durationMs: Math.max(0, Math.round(durationMs)),
    groups,
  };
}
