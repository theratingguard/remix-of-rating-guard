import { evaluateCrossReferenceRules, CROSS_REFERENCE_RULE_CATALOG } from "./cross-reference-rules";
import { EXPANDED_RULE_CATALOGS, evaluateExpandedRules } from "./expanded-checks";
import { EVIDENCE_RULE_CATALOG } from "./evidence-rules";
import { evaluateLinguisticRules, LINGUISTIC_RULE_CATALOG } from "./linguistic-rules";
import { evaluatePatternRules, PATTERN_RULE_CATALOG } from "./pattern-rules";
import { evaluateReviewerRules, REVIEWER_RULE_CATALOG } from "./reviewer-rules";
import { ADDITIONAL_RULE_CATALOGS, evaluateAdditionalRules } from "./additional-checks";
import { scoreRuleChecks } from "./scoring";
import { evaluateTextRules, TEXT_RULE_CATALOG } from "./text-rules";
import { evaluateTimingRules, TIMING_RULE_CATALOG } from "./timing-rules";
import type { MicroRuleResult, RuleCheck, RuleReviewContext, RuleScore } from "./types";

export type { MicroRuleResult } from "./types";

export const MICRO_RULE_CATALOGS = {
  text: [...TEXT_RULE_CATALOG, ...EXPANDED_RULE_CATALOGS.text, ...ADDITIONAL_RULE_CATALOGS.text],
  reviewer: [
    ...REVIEWER_RULE_CATALOG,
    ...EXPANDED_RULE_CATALOGS.reviewer,
    ...ADDITIONAL_RULE_CATALOGS.reviewer,
  ],
  temporal: [
    ...TIMING_RULE_CATALOG,
    ...EXPANDED_RULE_CATALOGS.temporal,
    ...ADDITIONAL_RULE_CATALOGS.temporal,
  ],
  crossPlatform: [
    ...CROSS_REFERENCE_RULE_CATALOG,
    ...EXPANDED_RULE_CATALOGS.crossPlatform,
    ...ADDITIONAL_RULE_CATALOGS.crossPlatform,
  ],
  network: [
    ...PATTERN_RULE_CATALOG,
    ...EXPANDED_RULE_CATALOGS.network,
    ...ADDITIONAL_RULE_CATALOGS.network,
  ],
  semantic: [
    ...LINGUISTIC_RULE_CATALOG,
    ...EVIDENCE_RULE_CATALOG,
    ...EXPANDED_RULE_CATALOGS.semantic,
    ...ADDITIONAL_RULE_CATALOGS.semantic,
  ],
  pattern: ADDITIONAL_RULE_CATALOGS.pattern,
  language: ADDITIONAL_RULE_CATALOGS.language,
} as const;

export const MICRO_RULE_CATALOG_COUNT = Object.values(MICRO_RULE_CATALOGS).reduce(
  (total, catalog) => total + catalog.length,
  0,
);

export function runMicroRules(input: RuleReviewContext): MicroRuleResult {
  const startedAt = performance.now();
  const checks = [
    ...evaluateTextRules(input),
    ...evaluateReviewerRules(input),
    ...evaluateTimingRules(input),
    ...evaluateCrossReferenceRules(input),
    ...evaluateLinguisticRules(input),
    ...evaluatePatternRules(input),
    ...evaluateExpandedRules(input),
    ...evaluateAdditionalRules(input),
  ];
  return {
    checks,
    score: scoreRuleChecks(checks, performance.now() - startedAt),
  };
}

export type PersistedRuleScore = Pick<
  RuleScore,
  "score" | "band" | "checksRun" | "checksAssessed" | "checksFlagged" | "durationMs" | "groups"
>;

export function persistedRuleScore(score: RuleScore): PersistedRuleScore {
  return {
    score: score.score,
    band: score.band,
    checksRun: score.checksRun,
    checksAssessed: score.checksAssessed,
    checksFlagged: score.checksFlagged,
    durationMs: score.durationMs,
    groups: score.groups,
  };
}

export function readPersistedRuleScore(value: unknown): PersistedRuleScore | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  const summary = root["rules_micro_check"];
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return null;
  const item = summary as Record<string, unknown>;
  if (
    typeof item["score"] !== "number" ||
    !["high", "medium", "low", "normal"].includes(String(item["band"])) ||
    typeof item["checksRun"] !== "number" ||
    typeof item["checksAssessed"] !== "number" ||
    typeof item["checksFlagged"] !== "number" ||
    typeof item["durationMs"] !== "number" ||
    !item["groups"] ||
    typeof item["groups"] !== "object" ||
    Array.isArray(item["groups"])
  )
    return null;

  const groups = item["groups"] as Record<string, unknown>;
  const currentGroups = Object.keys(MICRO_RULE_CATALOGS);
  if (currentGroups.every((group) => isRuleGroupScore(groups[group]))) {
    return summary as PersistedRuleScore;
  }

  const previousCurrentGroups = [
    "text",
    "reviewer",
    "temporal",
    "crossPlatform",
    "network",
    "semantic",
  ];
  if (previousCurrentGroups.every((group) => isRuleGroupScore(groups[group]))) {
    return {
      ...item,
      groups: {
        ...groups,
        pattern: emptyLegacyGroup(),
        language: emptyLegacyGroup(),
      },
    } as PersistedRuleScore;
  }

  const legacyGroupMap = {
    text: groups["text"],
    reviewer: groups["reviewer"],
    temporal: groups["timing"],
    crossPlatform: groups["crossReference"],
    network: groups["pattern"],
    semantic: groups["linguistic"],
    pattern: emptyLegacyGroup(),
    language: emptyLegacyGroup(),
  };
  if (!Object.values(legacyGroupMap).every(isRuleGroupScore)) return null;
  return { ...item, groups: legacyGroupMap } as PersistedRuleScore;
}

function emptyLegacyGroup() {
  return { score: 0, maxScore: 0, checks: 0, assessed: 0, flagged: 0 };
}

function isRuleGroupScore(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return ["score", "maxScore", "checks", "assessed", "flagged"].every(
    (key) => typeof item[key] === "number",
  );
}
