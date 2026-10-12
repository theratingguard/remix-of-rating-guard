import { makeCheck, observed } from "./checks";
import type { RuleCheck, RuleGroup, RuleReviewContext } from "./types";

export const EXPANDED_RULE_CATALOGS = {
  text: [
    "text-extra-comma-overuse",
    "text-extra-semicolon",
    "text-extra-ellipsis",
    "text-extra-em-dash",
    "text-extra-mixed-punctuation",
    "text-extra-no-punctuation",
    "text-extra-quotation-marks",
    "text-extra-currency-context",
    "text-extra-percentage-context",
    "text-extra-title-case",
    "text-extra-random-capitalization",
    "text-extra-business-name-caps",
    "text-extra-no-capitalization",
    "text-extra-mixed-case",
    "text-extra-vocabulary-richness",
    "text-extra-hapax-ratio",
    "text-extra-average-word-length",
    "text-extra-function-word-ratio",
    "text-extra-modal-verbs",
    "text-extra-passive-voice",
    "text-extra-conjunction-repetition",
    "text-extra-negation-frequency",
    "text-extra-sentence-length-variance",
    "text-extra-all-sentences-long",
    "text-extra-all-sentences-short",
    "text-extra-paragraph-count",
    "text-extra-paragraph-breaks",
    "text-extra-transition-phrases",
    "text-extra-hedging-language",
    "text-extra-intensifier-use",
    "text-extra-named-entity-density",
    "text-extra-temporal-reference",
    "text-extra-spatial-reference",
    "text-extra-sensory-detail",
    "text-extra-dialogue-or-quote",
  ],
  reviewer: [
    "reviewer-extra-account-creation",
    "reviewer-extra-email-domain",
    "reviewer-extra-email-verification",
    "reviewer-extra-phone-verification",
    "reviewer-extra-two-factor",
    "reviewer-extra-multiple-account-flags",
    "reviewer-extra-stock-photo",
    "reviewer-extra-profile-photo-missing",
    "reviewer-extra-first-review",
    "reviewer-extra-one-review",
    "reviewer-extra-bio-content",
    "reviewer-extra-bio-url",
    "reviewer-extra-generic-name",
    "reviewer-extra-name-language",
    "reviewer-extra-short-review-interval",
    "reviewer-extra-long-review-interval",
    "reviewer-extra-review-streak",
    "reviewer-extra-review-gap-pattern",
    "reviewer-extra-rating-concentration",
    "reviewer-extra-geographic-variation",
    "reviewer-extra-language-variation",
    "reviewer-extra-review-length-variation",
    "reviewer-extra-review-edit-frequency",
    "reviewer-extra-followers",
    "reviewer-extra-following",
    "reviewer-extra-social-links",
    "reviewer-extra-shared-photo",
    "reviewer-extra-name-business-match",
    "reviewer-extra-review-topic-consistency",
    "reviewer-extra-five-star-history",
  ],
  temporal: [
    "temporal-extra-exact-hour",
    "temporal-extra-half-hour",
    "temporal-extra-same-minute-daily",
    "temporal-extra-first-day-month",
    "temporal-extra-last-day-month",
    "temporal-extra-weekday-only",
    "temporal-extra-business-hours",
    "temporal-extra-business-closure",
    "temporal-extra-before-opening",
    "temporal-extra-platform-era",
    "temporal-extra-after-owner-change",
    "temporal-extra-after-staff-change",
    "temporal-extra-after-price-change",
    "temporal-extra-after-promotion",
    "temporal-extra-after-news",
    "temporal-extra-after-negative-post",
    "temporal-extra-after-viral-content",
    "temporal-extra-seasonal-change",
    "temporal-extra-media-mention",
    "temporal-extra-edited-multiple-times",
    "temporal-extra-deleted-reposted",
    "temporal-extra-visit-delay-over-year",
    "temporal-extra-review-under-hour-after-visit",
    "temporal-extra-review-under-week-after-visit",
    "temporal-extra-review-over-five-years-after-visit",
  ],
  crossPlatform: [
    "cross-extra-same-review-facebook-google",
    "cross-extra-same-review-tripadvisor-google",
    "cross-extra-same-text-different-platforms",
    "cross-extra-same-photo-different-platforms",
    "cross-extra-reviewer-name-multiple-platforms",
    "cross-extra-one-star-pattern",
    "cross-extra-five-star-pattern",
    "cross-extra-timing-pattern",
    "cross-extra-language-pattern",
    "cross-extra-grammar-pattern",
    "cross-extra-typo-pattern",
    "cross-extra-emoji-pattern",
    "cross-extra-hashtag-pattern",
    "cross-extra-url-pattern",
    "cross-extra-reviewed-competitors",
    "cross-extra-competitor-five-star",
    "cross-extra-competitor-one-star",
    "cross-extra-reviewed-all-competitors",
    "cross-extra-competitor-connection",
    "cross-extra-competitor-business-link",
    "cross-extra-competitor-ip",
    "cross-extra-competitor-email-domain",
    "cross-extra-competitor-phone",
    "cross-extra-competitor-comparison",
    "cross-extra-industry-attack-pattern",
  ],
  network: [
    "network-extra-shared-ip",
    "network-extra-shared-device",
    "network-extra-shared-subnet",
    "network-extra-shared-browser",
    "network-extra-shared-screen-size",
    "network-extra-shared-time-zone",
    "network-extra-shared-language",
    "network-extra-typing-speed",
    "network-extra-click-pattern",
    "network-extra-session-length",
    "network-extra-registration-date",
    "network-extra-first-review",
    "network-extra-star-distribution",
    "network-extra-review-text-style",
    "network-extra-coordinated-review-burst",
  ],
  semantic: [
    "semantic-extra-topic-business-match",
    "semantic-extra-topic-business-mismatch",
    "semantic-extra-topic-competitor",
    "semantic-extra-topic-employee",
    "semantic-extra-topic-price",
    "semantic-extra-topic-quality",
    "semantic-extra-topic-service",
    "semantic-extra-topic-cleanliness",
    "semantic-extra-topic-safety",
    "semantic-extra-topic-legality",
  ],
} as const satisfies Record<Exclude<RuleGroup, "pattern" | "language">, readonly string[]>;

const knownAdvisoryCheckIds = new Set<string>([
  "text-extra-comma-overuse",
  "text-extra-semicolon",
  "text-extra-ellipsis",
  "text-extra-em-dash",
  "text-extra-mixed-punctuation",
  "text-extra-no-punctuation",
  "text-extra-quotation-marks",
  "text-extra-currency-context",
  "text-extra-percentage-context",
  "text-extra-title-case",
  "text-extra-random-capitalization",
  "text-extra-no-capitalization",
  "text-extra-mixed-case",
  "text-extra-vocabulary-richness",
  "text-extra-hapax-ratio",
  "text-extra-average-word-length",
  "text-extra-function-word-ratio",
  "text-extra-modal-verbs",
  "text-extra-conjunction-repetition",
  "text-extra-negation-frequency",
  "text-extra-sentence-length-variance",
  "text-extra-all-sentences-long",
  "text-extra-all-sentences-short",
  "text-extra-paragraph-count",
  "text-extra-paragraph-breaks",
  "text-extra-transition-phrases",
  "text-extra-hedging-language",
  "text-extra-intensifier-use",
  "text-extra-temporal-reference",
  "text-extra-spatial-reference",
  "text-extra-sensory-detail",
  "text-extra-dialogue-or-quote",
  "reviewer-extra-profile-photo-missing",
  "reviewer-extra-reviews-per-day",
  "reviewer-extra-reviews-per-week",
  "reviewer-extra-rating-concentration",
  "reviewer-extra-geographic-variation",
  "reviewer-extra-language-variation",
  "reviewer-extra-rating-variation",
  "reviewer-extra-name-business-match",
  "temporal-extra-exact-hour",
  "temporal-extra-half-hour",
  "temporal-extra-first-day-month",
  "temporal-extra-last-day-month",
  "temporal-extra-after-owner-change",
  "temporal-extra-after-staff-change",
  "temporal-extra-after-price-change",
  "temporal-extra-after-promotion",
  "temporal-extra-after-news",
  "temporal-extra-after-negative-post",
  "temporal-extra-after-viral-content",
  "temporal-extra-seasonal-change",
  "temporal-extra-media-mention",
  "temporal-extra-review-under-hour-after-visit",
  "temporal-extra-review-under-week-after-visit",
  "temporal-extra-review-over-five-years-after-visit",
  "cross-extra-one-star-pattern",
  "cross-extra-five-star-pattern",
  "cross-extra-timing-pattern",
  "cross-extra-emoji-pattern",
  "cross-extra-hashtag-pattern",
  "cross-extra-url-pattern",
  "cross-extra-reviewed-competitors",
  "cross-extra-competitor-five-star",
  "cross-extra-competitor-one-star",
  "cross-extra-reviewed-all-competitors",
  "cross-extra-competitor-comparison",
  "semantic-extra-topic-competitor",
  "semantic-extra-topic-employee",
  "semantic-extra-topic-price",
  "semantic-extra-topic-quality",
  "semantic-extra-topic-service",
  "semantic-extra-topic-cleanliness",
  "semantic-extra-topic-safety",
  "semantic-extra-topic-legality",
]);

export function evaluateExpandedRules(input: RuleReviewContext): RuleCheck[] {
  const { text } = input;
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const lower = text.toLocaleLowerCase();
  const counts = new Map<string, number>();
  for (const word of words)
    counts.set(word.toLocaleLowerCase(), (counts.get(word.toLocaleLowerCase()) ?? 0) + 1);
  const sentences = text
    .split(/[.!?]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const sentenceLengths = sentences.map(
    (sentence) => sentence.match(/[\p{L}\p{N}]+/gu)?.length ?? 0,
  );
  const dates = input.reviewDate ? new Date(input.reviewDate) : null;
  const validDate = dates && Number.isFinite(dates.getTime());
  const localReviewHour = validDate && input.timeZone ? localHour(dates, input.timeZone) : null;
  const localReviewMinute = validDate && input.timeZone ? localMinute(dates, input.timeZone) : null;
  const competitorMention = (input.competitorNames ?? []).some(
    (name) => name.trim() && new RegExp(`\\b${escapeRegExp(name.trim())}\\b`, "iu").test(text),
  );
  const businessNameMatchesReviewer =
    Boolean(input.businessName && input.reviewer?.name) &&
    normalize(input.businessName ?? "") === normalize(input.reviewer?.name ?? "");
  const hasTopic = (pattern: RegExp) => (text ? pattern.test(text) : null);
  const assessments = new Map<string, boolean | null>([
    ["text-extra-comma-overuse", words.length ? (text.match(/,/gu)?.length ?? 0) >= 5 : null],
    ["text-extra-semicolon", words.length ? text.includes(";") : null],
    ["text-extra-ellipsis", words.length ? (text.match(/\.{3}|…/gu)?.length ?? 0) > 2 : null],
    ["text-extra-em-dash", words.length ? (text.match(/—/gu)?.length ?? 0) > 2 : null],
    ["text-extra-mixed-punctuation", words.length ? /[!?]{2,}|[!?].*[.!?]/u.test(text) : null],
    ["text-extra-no-punctuation", words.length ? !/[.!?]$/u.test(text) : null],
    ["text-extra-quotation-marks", words.length ? /["“”]/u.test(text) : null],
    ["text-extra-currency-context", words.length ? /[$₹€£]\s*\d/u.test(text) : null],
    ["text-extra-percentage-context", words.length ? /\b\d+(?:\.\d+)?\s?%/u.test(text) : null],
    [
      "text-extra-title-case",
      words.length >= 6
        ? words.filter((word) => /^\p{Lu}\p{Ll}+$/u.test(word)).length / words.length > 0.75
        : null,
    ],
    [
      "text-extra-random-capitalization",
      words.length >= 5 ? /\b\p{Ll}+\p{Lu}\p{Ll}+\b/u.test(text) : null,
    ],
    ["text-extra-no-capitalization", words.length >= 5 ? !/\p{Lu}/u.test(text) : null],
    [
      "text-extra-mixed-case",
      words.length >= 8 ? /\p{Lu}/u.test(text) && /\p{Ll}/u.test(text) : null,
    ],
    [
      "text-extra-vocabulary-richness",
      words.length >= 10
        ? new Set(words.map((word) => word.toLowerCase())).size / words.length < 0.3
        : null,
    ],
    [
      "text-extra-hapax-ratio",
      words.length >= 10
        ? [...counts.values()].filter((count) => count === 1).length / words.length < 0.5
        : null,
    ],
    [
      "text-extra-average-word-length",
      words.length >= 5
        ? words.reduce((sum, word) => sum + word.length, 0) / words.length > 8
        : null,
    ],
    [
      "text-extra-function-word-ratio",
      words.length >= 10
        ? words.filter((word) =>
            /^(?:the|a|an|and|or|but|of|to|in|on|at|for|with|is|was|were|are|it|this|that)$/iu.test(
              word,
            ),
          ).length /
            words.length >
          0.7
        : null,
    ],
    [
      "text-extra-modal-verbs",
      words.length ? /\b(?:could|would|should|might|may|must|shall)\b/iu.test(text) : null,
    ],
    [
      "text-extra-conjunction-repetition",
      words.length >= 8 ? (lower.match(/\b(?:and|but|or)\b/gu)?.length ?? 0) >= 4 : null,
    ],
    [
      "text-extra-negation-frequency",
      words.length >= 5
        ? (lower.match(/\b(?:no|not|never|n't|neither|nor)\b/gu)?.length ?? 0) / words.length > 0.3
        : null,
    ],
    [
      "text-extra-sentence-length-variance",
      sentenceLengths.length >= 3 ? variance(sentenceLengths) < 5 : null,
    ],
    [
      "text-extra-all-sentences-long",
      sentenceLengths.length >= 2 ? sentenceLengths.every((length) => length > 20) : null,
    ],
    [
      "text-extra-all-sentences-short",
      sentenceLengths.length >= 2 ? sentenceLengths.every((length) => length < 5) : null,
    ],
    [
      "text-extra-paragraph-count",
      words.length ? text.split(/\n\s*\n/u).filter((part) => part.trim()).length > 5 : null,
    ],
    ["text-extra-paragraph-breaks", words.length ? text.includes("\n") : null],
    [
      "text-extra-transition-phrases",
      words.length
        ? /\b(?:moreover|furthermore|in addition|therefore|consequently|overall)\b/iu.test(text)
        : null,
    ],
    [
      "text-extra-hedging-language",
      words.length ? /\b(?:maybe|perhaps|possibly|seems|appears|might)\b/iu.test(text) : null,
    ],
    [
      "text-extra-intensifier-use",
      words.length
        ? (lower.match(/\b(?:very|extremely|absolutely|incredibly|totally)\b/gu)?.length ?? 0) >= 3
        : null,
    ],
    [
      "text-extra-temporal-reference",
      words.length
        ? /\b(?:yesterday|today|last week|last month|on \w+day|in \d{4})\b/iu.test(text)
        : null,
    ],
    [
      "text-extra-spatial-reference",
      words.length ? /\b(?:at|inside|near|next to|across from)\s+[\p{L}\d]/iu.test(text) : null,
    ],
    [
      "text-extra-sensory-detail",
      words.length
        ? /\b(?:smelled|smell|tasted|taste|felt|feels|sound|sounded|texture|loud|quiet|spicy|cold|warm)\b/iu.test(
            text,
          )
        : null,
    ],
    ["text-extra-dialogue-or-quote", words.length ? /["“”]/u.test(text) : null],
    [
      "reviewer-extra-profile-photo-missing",
      input.reviewer?.hasPhoto == null ? null : !input.reviewer.hasPhoto,
    ],
    [
      "reviewer-extra-first-review",
      input.reviewer?.totalReviewCount == null ? null : input.reviewer.totalReviewCount === 0,
    ],
    [
      "reviewer-extra-one-review",
      input.reviewer?.totalReviewCount == null ? null : input.reviewer.totalReviewCount === 1,
    ],
    [
      "reviewer-extra-rating-concentration",
      input.reviewer?.oneStarReviewCount == null ||
      input.reviewer?.totalReviewCount == null ||
      input.reviewer.totalReviewCount < 5
        ? null
        : input.reviewer.oneStarReviewCount / input.reviewer.totalReviewCount > 0.8,
    ],
    [
      "reviewer-extra-geographic-variation",
      input.reviewer?.locationCountry && input.context?.businessCountry
        ? input.reviewer.locationCountry.toUpperCase() !==
          input.context.businessCountry.toUpperCase()
        : null,
    ],
    [
      "reviewer-extra-language-variation",
      input.expectedLanguage ? languageMismatch(text, input.expectedLanguage) : null,
    ],
    [
      "reviewer-extra-name-business-match",
      input.reviewer?.name && input.businessName ? businessNameMatchesReviewer : null,
    ],
    ["temporal-extra-exact-hour", localReviewHour === null ? null : localReviewHour === 0],
    ["temporal-extra-half-hour", localReviewMinute === null ? null : localReviewMinute === 30],
    ["temporal-extra-first-day-month", validDate ? dates.getDate() === 1 : null],
    [
      "temporal-extra-last-day-month",
      validDate
        ? new Date(dates.getFullYear(), dates.getMonth() + 1, 0).getDate() === dates.getDate()
        : null,
    ],
    ["temporal-extra-after-owner-change", null],
    ["temporal-extra-after-staff-change", null],
    ["temporal-extra-after-price-change", null],
    ["temporal-extra-after-promotion", null],
    ["temporal-extra-after-news", null],
    ["temporal-extra-after-negative-post", null],
    ["temporal-extra-after-viral-content", null],
    ["temporal-extra-seasonal-change", null],
    ["temporal-extra-media-mention", null],
    ["temporal-extra-review-under-hour-after-visit", null],
    ["temporal-extra-review-under-week-after-visit", null],
    ["temporal-extra-review-over-five-years-after-visit", null],
    [
      "cross-extra-one-star-pattern",
      input.history?.length ? input.history.filter((item) => item.rating === 1).length >= 5 : null,
    ],
    [
      "cross-extra-five-star-pattern",
      input.history?.length ? input.history.filter((item) => item.rating === 5).length >= 5 : null,
    ],
    [
      "cross-extra-timing-pattern",
      input.reviewer?.postingTimes
        ? input.reviewer.postingTimes.length >= 3 &&
          new Set(input.reviewer.postingTimes.map((item) => item.slice(11, 16))).size === 1
        : null,
    ],
    [
      "cross-extra-emoji-pattern",
      input.history?.length
        ? input.history.some(
            (item) =>
              (item.text.match(/\p{Extended_Pictographic}/gu)?.length ?? 0) ===
              (text.match(/\p{Extended_Pictographic}/gu)?.length ?? 0),
          )
        : null,
    ],
    [
      "cross-extra-hashtag-pattern",
      input.history?.length
        ? input.history.some(
            (item) =>
              Boolean(item.text.match(/#\w+/gu)?.length) &&
              item.text.match(/#\w+/gu)?.join(" ") === text.match(/#\w+/gu)?.join(" "),
          )
        : null,
    ],
    [
      "cross-extra-url-pattern",
      input.history?.length
        ? input.history.some(
            (item) =>
              Boolean(item.text.match(/https?:\/\/\S+/giu)?.length) &&
              item.text.match(/https?:\/\/\S+/giu)?.join(" ") ===
                text.match(/https?:\/\/\S+/giu)?.join(" "),
          )
        : null,
    ],
    [
      "cross-extra-reviewed-competitors",
      input.reviewer?.reviewedCompetitorNames && input.competitorNames
        ? input.reviewer.reviewedCompetitorNames.some((name) =>
            input.competitorNames?.some((competitor) => normalize(name) === normalize(competitor)),
          )
        : null,
    ],
    [
      "cross-extra-competitor-five-star",
      input.history && input.competitorNames
        ? input.history.some(
            (item) =>
              item.rating === 5 &&
              input.competitorNames?.some(
                (name) => normalize(name) === normalize(item.businessName ?? ""),
              ),
          )
        : null,
    ],
    [
      "cross-extra-competitor-one-star",
      input.history && input.competitorNames
        ? input.history.some(
            (item) =>
              item.rating === 1 &&
              input.competitorNames?.some(
                (name) => normalize(name) === normalize(item.businessName ?? ""),
              ),
          )
        : null,
    ],
    [
      "cross-extra-reviewed-all-competitors",
      input.reviewer?.reviewedCompetitorNames && input.competitorNames?.length
        ? input.competitorNames.every((name) =>
            input.reviewer?.reviewedCompetitorNames?.some(
              (reviewed) => normalize(reviewed) === normalize(name),
            ),
          )
        : null,
    ],
    [
      "cross-extra-competitor-comparison",
      competitorMention ? /\b(?:better|worse|than|compared to)\b/iu.test(text) : null,
    ],
    [
      "semantic-extra-topic-competitor",
      hasTopic(/\b(?:competitor|compared to|better than|worse than)\b/iu),
    ],
    ["semantic-extra-topic-employee", hasTopic(/\b(?:employee|staff|server|manager|owner)\b/iu)],
    ["semantic-extra-topic-price", hasTopic(/\b(?:price|cost|expensive|cheap|bill|charge)\b/iu)],
    [
      "semantic-extra-topic-quality",
      hasTopic(/\b(?:quality|broken|defect|fresh|stale|damaged)\b/iu),
    ],
    ["semantic-extra-topic-service", hasTopic(/\b(?:service|waiter|server|staff|support)\b/iu)],
    ["semantic-extra-topic-cleanliness", hasTopic(/\b(?:clean|dirty|hygiene|sanitary|mess)\b/iu)],
    ["semantic-extra-topic-safety", hasTopic(/\b(?:safe|unsafe|danger|safety|injury)\b/iu)],
    ["semantic-extra-topic-legality", hasTopic(/\b(?:illegal|law|legal|police|court|license)\b/iu)],
  ]);

  const result: RuleCheck[] = [];
  for (const [group, ids] of Object.entries(EXPANDED_RULE_CATALOGS) as [
    RuleGroup,
    readonly string[],
  ][]) {
    for (const id of ids) {
      const assessment = assessments.get(id);
      if (!knownAdvisoryCheckIds.has(id) || assessment === undefined) {
        result.push(
          makeCheck(
            id,
            group,
            "not_assessed",
            0,
            "Required profile, platform, network, or event data is not supplied; no external data was collected.",
          ),
        );
      } else {
        result.push(
          observed(
            id,
            group,
            assessment,
            0,
            assessment === null
              ? "Insufficient supplied data to assess this signal."
              : "Deterministic text/context observation only; not evidence of policy violation or inauthenticity.",
          ),
        );
      }
    }
  }
  return result;
}

function variance(values: number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

function normalize(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function languageMismatch(text: string, language: string) {
  const scripts: Record<string, RegExp> = {
    en: /\p{Script=Latin}/u,
    fr: /\p{Script=Latin}/u,
    de: /\p{Script=Latin}/u,
    es: /\p{Script=Latin}/u,
    hi: /\p{Script=Devanagari}/u,
    ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
    ar: /\p{Script=Arabic}/u,
    ru: /\p{Script=Cyrillic}/u,
  };
  const expected = scripts[language.toLocaleLowerCase().split("-")[0] ?? ""];
  return expected && /\p{L}/u.test(text) ? !expected.test(text) : null;
}

function localHour(date: Date, timeZone: string) {
  try {
    return Number(
      new Intl.DateTimeFormat("en", { timeZone, hour: "2-digit", hourCycle: "h23" })
        .formatToParts(date)
        .find((part) => part.type === "hour")?.value,
    );
  } catch {
    return null;
  }
}

function localMinute(date: Date, timeZone: string) {
  try {
    return Number(
      new Intl.DateTimeFormat("en", { timeZone, minute: "2-digit" })
        .formatToParts(date)
        .find((part) => part.type === "minute")?.value,
    );
  } catch {
    return null;
  }
}
