import { completeChecks, observed } from "./checks";
import type { RuleCheck, RuleReviewContext } from "./types";

export const LINGUISTIC_RULE_CATALOG = [
  "linguistic-extreme-negative-count",
  "linguistic-specific-experience-details",
  "linguistic-generic-content",
  "linguistic-marketing-language",
  "linguistic-explicit-translation-marker",
  "linguistic-configured-language-script",
  "linguistic-first-person-experience",
  "linguistic-time-reference",
  "linguistic-place-reference",
  "linguistic-quantity-reference",
  "linguistic-repeated-sentiment",
  "linguistic-grammar-analysis",
  "linguistic-sarcasm-context",
  "linguistic-language-metadata",
  "linguistic-translation-detection",
] as const;

const extremeNegative = [
  "worst",
  "disgusting",
  "horrible",
  "awful",
  "scam",
  "fraud",
  "evil",
  "terrible",
  "unacceptable",
  "pathetic",
  "dangerous",
  "criminal",
  "nightmare",
  "never",
  "hate",
];
const marketingLanguage =
  /\b(?:discount|coupon|cashback|special offer|limited time|buy now|click here|visit us|book now)\b/iu;

export function evaluateLinguisticRules(input: RuleReviewContext): RuleCheck[] {
  const checks = new Map<string, RuleCheck>();
  const put = (check: RuleCheck) => checks.set(check.id, check);
  const lower = input.text.toLocaleLowerCase();
  const wordCount = input.text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  const negativeWords = extremeNegative.filter((word) =>
    new RegExp(`\\b${escapeRegExp(word)}\\b`, "iu").test(input.text),
  );
  const hasSpecificity =
    /\b(?:at|on|around|between)\s+(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/iu.test(
      input.text,
    ) ||
    /\b(?:\$|₹|€|£)\s?\d+(?:[.,]\d{1,2})?\b/u.test(input.text) ||
    /\b(?:waited|ordered|paid|visited|booked|received|spoke to|served by)\b/iu.test(input.text);
  const hasFirstPerson = /\b(?:i|we|my|our)\b/iu.test(input.text);
  const hasTimeReference =
    /\b(?:yesterday|today|last (?:week|month|year)|on \w+day|in \w+ \d{4})\b/iu.test(input.text);
  const hasPlaceReference =
    /\b(?:at|inside|near|next to|located)\s+[\p{L}\d][\p{L}\d '-]{2,}/iu.test(input.text);
  const hasQuantity = /\b\d+(?:[.,]\d+)?\b/u.test(input.text);
  const translationMarker =
    /\b(?:translated (?:by|with|from)|google translate|machine[- ]translated)\b/iu.test(input.text);

  put(
    observed(
      "linguistic-extreme-negative-count",
      "semantic",
      wordCount ? negativeWords.length > 5 : null,
      2,
      `${negativeWords.length} terms from a fixed extreme-language list; sentiment alone is not evidence of a policy violation.`,
    ),
  );
  put(
    observed(
      "linguistic-specific-experience-details",
      "semantic",
      wordCount ? hasSpecificity : null,
      0,
      "Review contains an experience-specific action, time, or amount; verify against original records.",
    ),
  );
  put(
    observed(
      "linguistic-generic-content",
      "semantic",
      wordCount ? wordCount >= 5 && !hasSpecificity && !hasFirstPerson : null,
      1,
      "Review contains little identifiable first-person or event detail; this alone does not show it is fake.",
    ),
  );
  put(
    observed(
      "linguistic-marketing-language",
      "semantic",
      wordCount ? marketingLanguage.test(input.text) : null,
      2,
      "Contains a known promotional phrase.",
    ),
  );
  put(
    observed(
      "linguistic-explicit-translation-marker",
      "semantic",
      wordCount ? translationMarker : null,
      0,
      "Review explicitly says it was machine-translated; translation does not imply inauthenticity.",
    ),
  );
  put(
    observed(
      "linguistic-configured-language-script",
      "semantic",
      input.expectedLanguage ? scriptMismatch(input.text, input.expectedLanguage) : null,
      0,
      `Expected-language script check for ${input.expectedLanguage ?? "unknown"}; script difference is not proof of a fake review.`,
    ),
  );
  put(
    observed(
      "linguistic-first-person-experience",
      "semantic",
      wordCount ? hasFirstPerson : null,
      0,
      "First-person experience language is present.",
    ),
  );
  put(
    observed(
      "linguistic-time-reference",
      "semantic",
      wordCount ? hasTimeReference : null,
      0,
      "A textual time reference is present; verify only if material.",
    ),
  );
  put(
    observed(
      "linguistic-place-reference",
      "semantic",
      wordCount ? hasPlaceReference : null,
      0,
      "A possible place reference is present; verify only if material.",
    ),
  );
  put(
    observed(
      "linguistic-quantity-reference",
      "semantic",
      wordCount ? hasQuantity : null,
      0,
      "A numeric quantity is present; verify only if material.",
    ),
  );
  const repeatedSentiment = /(great|bad|worst|amazing|terrible)(?:\s+\1){2,}/iu.test(lower);
  put(
    observed(
      "linguistic-repeated-sentiment",
      "semantic",
      wordCount ? repeatedSentiment : null,
      1,
      "A sentiment word repeats multiple times.",
    ),
  );
  put(
    observed(
      "linguistic-grammar-analysis",
      "semantic",
      null,
      0,
      "Grammar quality is not evaluated by deterministic rules.",
    ),
  );
  put(
    observed(
      "linguistic-sarcasm-context",
      "semantic",
      null,
      0,
      "Sarcasm and pragmatic context are not reliably assessable with deterministic rules.",
    ),
  );
  put(
    observed(
      "linguistic-language-metadata",
      "semantic",
      input.expectedLanguage ? true : null,
      0,
      `Expected language configured: ${input.expectedLanguage ?? "no"}.`,
    ),
  );
  put(
    observed(
      "linguistic-translation-detection",
      "semantic",
      null,
      0,
      "No translation detector or external language service is used.",
    ),
  );

  return completeChecks("semantic", LINGUISTIC_RULE_CATALOG, checks);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function scriptMismatch(text: string, language: string): boolean | null {
  const scripts: Record<string, RegExp> = {
    en: /\p{Script=Latin}/u,
    fr: /\p{Script=Latin}/u,
    de: /\p{Script=Latin}/u,
    es: /\p{Script=Latin}/u,
    it: /\p{Script=Latin}/u,
    nl: /\p{Script=Latin}/u,
    pt: /\p{Script=Latin}/u,
    hi: /\p{Script=Devanagari}/u,
    ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
    zh: /\p{Script=Han}/u,
    ko: /\p{Script=Hangul}/u,
    ar: /\p{Script=Arabic}/u,
    ru: /\p{Script=Cyrillic}/u,
  };
  const script = scripts[language.toLocaleLowerCase().split("-")[0] ?? ""];
  return script && /\p{L}/u.test(text) ? !script.test(text) : null;
}
