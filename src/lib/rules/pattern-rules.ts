import { completeChecks, contextual, observed } from "./checks";
import { EVIDENCE_RULE_CATALOG, evaluateEvidenceRules } from "./evidence-rules";
import type { RuleCheck, RuleReviewContext } from "./types";

const patternSignalCatalog = [
  "pattern-best-in-city-seo",
  "pattern-boycott-imperative",
  "pattern-police-report-claim",
  "pattern-perfect-superlative",
  "pattern-exact-date-mention",
  "pattern-vague-timing",
  "pattern-hearsay-claim",
  "pattern-threat-language",
  "pattern-review-for-sale",
  "pattern-keyword-stuffing",
  "pattern-repeated-competitor-claim",
  "pattern-template-phrase",
  "pattern-copy-paste-history",
  "pattern-review-experience-claim",
  "pattern-absolute-generalization",
] as const;
export const PATTERN_RULE_CATALOG = patternSignalCatalog;

export function evaluatePatternRules(input: RuleReviewContext): RuleCheck[] {
  const text = input.text;
  const history = input.history;
  const normalized = normalize(text);
  const matchCount = (pattern: RegExp) => (text.match(pattern) ?? []).length;
  const exactDates = matchCount(
    /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?)\b/giu,
  );
  const bestInCity =
    /\bbest\s+[\p{L}\p{N}'-]+(?:\s+[\p{L}\p{N}'-]+){0,3}\s+in\s+[\p{L}\p{N}'-]+/iu.test(text);
  const hasBusinessSpecificDetail =
    /\b(?:waited|ordered|paid|booked|visited|received|spoke to|served by)\b/iu.test(text) ||
    exactDates > 0 ||
    /\b(?:\$|₹|€|£)\s?\d+/u.test(text);
  const promo =
    /\b(?:best price|buy now|special offer|discount|coupon|click here|visit us|book now)\b/iu.test(
      text,
    );
  const threat =
    /\b(?:i will (?:kill|hurt|attack|damage)|i am going to (?:kill|hurt|attack)|pay me or)\b/iu.test(
      text,
    );
  const competitorNames = input.competitorNames ?? [];
  const competitorMentioned = competitorNames.some(
    (name) => name.trim() && new RegExp(`\\b${escapeRegExp(name.trim())}\\b`, "iu").test(text),
  );
  const templateMatch =
    /\b(?:best service ever|highly recommend to everyone|must visit|never coming back)\b/iu.test(
      text,
    );
  const copied = history?.some((item) => normalize(item.text) === normalized) ?? false;
  const checks = new Map<string, RuleCheck>();
  const put = (check: RuleCheck) => checks.set(check.id, check);

  put(
    observed(
      "pattern-best-in-city-seo",
      "network",
      text ? bestInCity : null,
      1,
      "Contains a generic 'best in [place]' construction; this is not proof of SEO manipulation.",
    ),
  );
  put(
    observed(
      "pattern-boycott-imperative",
      "network",
      text ? /\b(?:don't|do not) go here\b/iu.test(text) : null,
      0,
      "Contains a boycott-style opinion; negative criticism alone is not a policy violation.",
    ),
  );
  put(
    contextual(
      "pattern-police-report-claim",
      "network",
      text ? /\b(?:reported|reporting) (?:this|them|you) to (?:the )?police\b/iu.test(text) : null,
      "Mentions contacting police; context is needed and this is not by itself a threat.",
    ),
  );
  put(
    observed(
      "pattern-perfect-superlative",
      "network",
      text
        ? /\b(?:perfect|flawless|best ever|absolutely perfect)\b/iu.test(text) &&
            !hasBusinessSpecificDetail
        : null,
      0,
      "Contains an unusually broad positive superlative without specific details; this is not proof of a fake review.",
    ),
  );
  put(
    contextual(
      "pattern-exact-date-mention",
      "network",
      text ? exactDates > 0 : null,
      `Found ${exactDates} date-like reference(s); verify against available records.`,
    ),
  );
  put(
    observed(
      "pattern-vague-timing",
      "network",
      input.context?.explicitlyVagueTiming ?? null,
      0,
      "Review context explicitly marked timing as vague; this does not establish fabrication.",
    ),
  );
  put(
    observed(
      "pattern-hearsay-claim",
      "network",
      input.context?.hearsayOnly ?? null,
      0,
      "Review context explicitly marked the account as hearsay-only; verify what the author actually claims.",
    ),
  );
  put(
    observed(
      "pattern-threat-language",
      "network",
      text ? threat : null,
      threat ? 4 : 0,
      "Contains a direct conditional threat pattern; preserve the exact text and assess context.",
    ),
  );
  put(
    observed(
      "pattern-review-for-sale",
      "network",
      text ? /\b(?:pay|paid|payment) (?:me|for) (?:to )?(?:review|write)\b/iu.test(text) : null,
      3,
      "Text suggests payment in exchange for a review.",
    ),
  );
  put(
    observed(
      "pattern-keyword-stuffing",
      "network",
      text ? bestInCity && promo : null,
      1,
      "Combines a search-optimized phrase with promotional wording.",
    ),
  );
  put(
    contextual(
      "pattern-repeated-competitor-claim",
      "network",
      competitorNames.length ? competitorMentioned : null,
      `Mentioned supplied competitor name(s): ${competitorNames.filter((name) => new RegExp(`\\b${escapeRegExp(name.trim())}\\b`, "iu").test(text)).join(", ") || "none"}.`,
    ),
  );
  put(
    observed(
      "pattern-template-phrase",
      "network",
      text ? templateMatch : null,
      0,
      "Contains a common review phrase; common wording alone does not show coordinated activity.",
    ),
  );
  put(
    observed(
      "pattern-copy-paste-history",
      "network",
      history?.length ? copied : null,
      2,
      "Normalized review text exactly matches supplied review history.",
    ),
  );
  put(
    observed(
      "pattern-review-experience-claim",
      "network",
      text ? /\b(?:i|we)\s+(?:visited|ordered|ate|stayed|bought|used)\b/iu.test(text) : null,
      0,
      "First-person experience statement is present; corroboration is not implied.",
    ),
  );
  put(
    contextual(
      "pattern-absolute-generalization",
      "network",
      text ? /\b(?:everyone|nobody|always|never)\b/iu.test(text) : null,
      "Contains an absolute generalization; context is necessary and this is not proof of a false claim.",
    ),
  );
  const evidenceChecks = evaluateEvidenceRules(input);
  return [...completeChecks("network", PATTERN_RULE_CATALOG, checks), ...evidenceChecks];
}

function normalize(text: string) {
  return text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
