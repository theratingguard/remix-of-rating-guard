import { completeChecks, observed } from "./checks";
import type { RuleCheck, RuleReviewContext } from "./types";

export const CROSS_REFERENCE_RULE_CATALOG = [
  "cross-same-reviewer-competitor",
  "cross-five-one-stars-same-day",
  "cross-similar-review-text",
  "cross-multi-platform-pattern",
  "cross-exact-duplicate",
  "cross-near-duplicate",
  "cross-same-reviewer-business-repeat",
  "cross-shared-competitor-targets",
  "cross-identical-phrase-multiple-reviewers",
  "cross-rating-cluster",
  "cross-burst-reviewers",
  "cross-common-link",
  "cross-common-contact",
  "cross-history-missing",
  "cross-platform-history-missing",
] as const;

export function evaluateCrossReferenceRules(input: RuleReviewContext): RuleCheck[] {
  const checks = new Map<string, RuleCheck>();
  const put = (check: RuleCheck) => checks.set(check.id, check);
  const history = input.history;
  const reviewerName = normalize(input.reviewer?.name ?? "");
  const competitors = input.competitorNames ?? [];
  const reviewerHistory = reviewerName
    ? (history ?? []).filter((item) => normalize(item.reviewerName ?? "") === reviewerName)
    : [];
  const competitorHistory = reviewerHistory.filter((item) =>
    competitors.some((name) => normalize(name) === normalize(item.businessName ?? "")),
  );
  const duplicate = history?.some((item) => normalize(item.text) === normalize(input.text));
  const nearDuplicate = history?.some((item) => similarity(input.text, item.text) >= 0.75) ?? false;
  const currentWords = new Set(tokens(input.text));
  const phraseHistory = history?.filter((item) => {
    const shared = tokens(item.text).filter((word) => currentWords.has(word));
    return shared.length >= 5;
  });
  const historyRatings: number[] = (history ?? []).flatMap((item) =>
    item.rating === undefined ? [] : [item.rating],
  );
  const oneStarCluster =
    historyRatings.length >= 5 && historyRatings.filter((rating) => rating === 1).length >= 5;
  const authorCount = new Set(
    (history ?? []).map((item) => normalize(item.reviewerName ?? "")).filter(Boolean),
  ).size;
  const commonUrl =
    history?.some((item) =>
      extractLinks(item.text).some((link) => extractLinks(input.text).includes(link)),
    ) ?? false;
  const commonContact =
    history?.some((item) => {
      const current = extractContact(input.text);
      return (
        current.length > 0 && current.some((value) => extractContact(item.text).includes(value))
      );
    }) ?? false;

  put(
    observed(
      "cross-same-reviewer-competitor",
      "crossPlatform",
      competitors.length > 0 && history ? competitorHistory.length > 0 : null,
      3,
      "Same reviewer appears in supplied history reviewing a named competitor.",
    ),
  );
  put(
    observed(
      "cross-five-one-stars-same-day",
      "crossPlatform",
      input.context?.sameDayOneStarCount == null ? null : input.context.sameDayOneStarCount >= 5,
      4,
      `${input.context?.sameDayOneStarCount ?? 0} same-day one-star reviews in supplied context.`,
    ),
  );
  put(
    observed(
      "cross-similar-review-text",
      "crossPlatform",
      history?.length ? nearDuplicate : null,
      3,
      "Review text substantially overlaps another supplied review.",
    ),
  );
  put(
    observed(
      "cross-multi-platform-pattern",
      "crossPlatform",
      input.context?.multiPlatformPattern ?? null,
      2,
      "A matching pattern across platforms was explicitly supplied; cross-platform data was not fetched.",
    ),
  );
  put(
    observed(
      "cross-exact-duplicate",
      "crossPlatform",
      history?.length ? (duplicate ?? false) : null,
      2,
      "Normalized text exactly matches a supplied historical review.",
    ),
  );
  put(
    observed(
      "cross-near-duplicate",
      "crossPlatform",
      history?.length ? nearDuplicate : null,
      2,
      "Token overlap indicates a possible near-duplicate; shared wording can be legitimate.",
    ),
  );
  put(
    observed(
      "cross-same-reviewer-business-repeat",
      "crossPlatform",
      history ? reviewerHistory.length > 1 : null,
      1,
      "Same reviewer has multiple entries in the supplied history.",
    ),
  );
  put(
    observed(
      "cross-shared-competitor-targets",
      "crossPlatform",
      competitors.length > 0 && history ? competitorHistory.length >= 2 : null,
      1,
      `${competitorHistory.length} supplied historical competitor review(s) by the same reviewer.`,
    ),
  );
  put(
    observed(
      "cross-identical-phrase-multiple-reviewers",
      "crossPlatform",
      history?.length && authorCount > 1 ? Boolean(phraseHistory?.length) : null,
      2,
      "A supplied phrase overlap occurs across multiple reviewers; this does not establish coordination.",
    ),
  );
  put(
    observed(
      "cross-rating-cluster",
      "crossPlatform",
      historyRatings.length ? oneStarCluster : null,
      1,
      "Five or more supplied history entries are one-star ratings.",
    ),
  );
  put(
    observed(
      "cross-burst-reviewers",
      "crossPlatform",
      input.context?.sameDayOneStarCount == null ? null : input.context.sameDayOneStarCount >= 5,
      2,
      "Several one-star reviews share a supplied calendar date.",
    ),
  );
  put(
    observed(
      "cross-common-link",
      "crossPlatform",
      history?.length ? commonUrl : null,
      1,
      "A URL appears both in this review and supplied review history.",
    ),
  );
  put(
    observed(
      "cross-common-contact",
      "crossPlatform",
      history?.length ? commonContact : null,
      1,
      "The same phone/email-like string appears in supplied reviews.",
    ),
  );
  put(
    observed(
      "cross-history-missing",
      "crossPlatform",
      history?.length ? false : null,
      0,
      "No historical reviews were supplied for comparison.",
    ),
  );
  put(
    observed(
      "cross-platform-history-missing",
      "crossPlatform",
      history?.some((item) => item.platform) ? false : null,
      0,
      "No platform identifiers were supplied; multi-platform activity cannot be checked.",
    ),
  );

  return completeChecks("crossPlatform", CROSS_REFERENCE_RULE_CATALOG, checks);
}

function normalize(text: string) {
  return text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(text: string) {
  return normalize(text)
    .split(/\s+/u)
    .filter((token) => token.length > 3);
}

function similarity(left: string, right: string) {
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  if (leftTokens.size < 5 || rightTokens.size < 5) return 0;
  const common = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return common / new Set([...leftTokens, ...rightTokens]).size;
}

function extractLinks(text: string): string[] {
  const matches = text.match(/(?:https?:\/\/|www\.)\S+/giu);
  return matches ? [...matches] : [];
}

function extractContact(text: string): string[] {
  return [
    ...(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu) ?? []),
    ...(text.match(/(?:\+?\d[\d\s().-]{7,}\d)/gu) ?? []),
  ];
}
