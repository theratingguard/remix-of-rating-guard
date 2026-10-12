import { z } from "zod";
import { runMicroRules, type MicroRuleResult } from "./rules/micro-rules";
import type { RuleCheck, RuleScore } from "./rules/types";

const reviewerSchema = z.object({
  name: z.string().nullish(),
  reviewedBusinessCount: z.number().int().nonnegative().nullish(),
  accountAgeDays: z.number().int().nonnegative().nullish(),
  hasPhoto: z.boolean().nullish(),
  oneStarReviewCount: z.number().int().nonnegative().nullish(),
  totalReviewCount: z.number().int().nonnegative().nullish(),
  reviewsInLastHour: z.number().int().nonnegative().nullish(),
  locationCountry: z.string().nullish(),
  postingTimes: z.array(z.string()).optional(),
  reviewedCompetitorNames: z.array(z.string()).optional(),
  negativeReviewCount: z.number().int().nonnegative().nullish(),
  recentReviewCount: z.number().int().nonnegative().nullish(),
  sharedTargetBusinessCount: z.number().int().nonnegative().nullish(),
});

const businessSchema = z.object({
  name: z.string().nullish(),
  country: z.string().nullish(),
  competitorNames: z.array(z.string()).optional(),
  owner: z
    .object({
      name: z.string().nullish(),
    })
    .nullish(),
});

export const rulesReviewSchema = z.object({
  text: z.string().optional(),
  reviewText: z.string().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  reviewer: reviewerSchema.optional(),
  business: businessSchema.optional(),
  duplicateText: z.boolean().optional(),
  repeatedAcrossScans: z.boolean().optional(),
  duplicateReviewTexts: z.array(z.string()).optional(),
  comparisonReviewTexts: z.array(z.string()).optional(),
  reviewDate: z.string().datetime({ offset: true }).optional(),
  timeZone: z.string().optional(),
  expectedLanguage: z.string().optional(),
  competitorNames: z.array(z.string()).optional(),
  history: z
    .array(
      z.object({
        text: z.string(),
        rating: z.number().int().min(1).max(5).optional(),
        publishedAt: z.string().optional(),
        reviewerName: z.string().optional(),
        platform: z.string().optional(),
        businessName: z.string().optional(),
      }),
    )
    .optional(),
  context: z
    .object({
      isPublicHoliday: z.boolean().optional(),
      previousCompetitorReviewAt: z.string().optional(),
      businessEventDates: z.array(z.string()).optional(),
      sameReviewerCompetitorCount: z.number().int().nonnegative().optional(),
      sameDayOneStarCount: z.number().int().nonnegative().optional(),
      multiPlatformPattern: z.boolean().optional(),
      photoOrReceiptAvailable: z.boolean().optional(),
      exactNames: z.array(z.string()).optional(),
      exactDates: z.array(z.string()).optional(),
      exactAmounts: z.array(z.string()).optional(),
      explicitlyVagueTiming: z.boolean().optional(),
      hearsayOnly: z.boolean().optional(),
      businessCountry: z.string().optional(),
    })
    .optional(),
  reviewsInWindow: z.number().int().nonnegative().optional(),
  windowMinutes: z.number().positive().optional(),
  review_id: z.string().uuid().optional(),
});

export type RulesReview = z.infer<typeof rulesReviewSchema>;

export type RulesResult = {
  violates: boolean;
  policy: string;
  confidence: number;
  evidence: string;
  source: "rules";
  rules_triggered?: number;
  forensics?: ForensicSignal[];
  micro_score?: RuleScore;
  micro_checks?: RuleCheck[];
};

export type ForensicSignal = {
  category: "text" | "reviewer" | "temporal" | "network" | "biometrics" | "digital_fingerprint";
  status: "observed" | "not_assessed";
  confidence: number;
  evidence: string;
};

const normalize = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";
const normalizeFingerprint = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

function tokenSimilarity(left: string, right: string) {
  const leftTokens = normalizeFingerprint(left).split(" ").filter(Boolean);
  const rightTokens = normalizeFingerprint(right).split(" ").filter(Boolean);
  if (leftTokens.length < 6 || rightTokens.length < 6) return 0;
  const shingles = (tokens: string[]) =>
    new Set(tokens.slice(0, -2).map((_, index) => tokens.slice(index, index + 3).join(" ")));
  const leftShingles = shingles(leftTokens);
  const rightShingles = shingles(rightTokens);
  const intersection = [...leftShingles].filter((shingle) => rightShingles.has(shingle)).length;
  const union = new Set([...leftShingles, ...rightShingles]).size;
  return union ? intersection / union : 0;
}

const promoPhrases = [
  "discount",
  "coupon",
  "cashback",
  "click here",
  "click now",
  "buy now",
  "visit now",
  "visit today",
  "visit our",
  "sale",
  "limited time",
  "book now",
  "call now",
  "order here",
  "offer ends",
  "special offer",
];
const promoWordPattern = /\b(?:discount|coupon|cashback|sale|offer|click|buy|visit|call|book)\b/i;
const promoPhrasePattern =
  /(?:click here|click now|buy now|visit now|visit today|visit our|limited time|book now|call now|order here|offer ends|special offer)/i;
const hateWords = [
  "idiot",
  "stupid",
  "fool",
  "moron",
  "loser",
  "gandu",
  "bhenchod",
  "bewakoof",
  "chutiya",
  "kutte",
  "kutta",
  "bakwas",
  "bastard",
  "hate",
  "nazi",
  "slur",
  "terrorist",
  "mullah",
  "kafir",
  "gaddar",
  "behen",
  "madarchod",
  "randi",
];
const threatWords = [
  "kill",
  "hurt",
  "damage",
  "attack",
  "pay me",
  "i will report your",
  "i will ruin",
];

function captureEvidence(label: string, detail: string) {
  return `${label}: ${detail}`;
}

function buildResult(
  violates: boolean,
  policy: string,
  confidence: number,
  evidence: string,
  rulesTriggered = 0,
  microRules: MicroRuleResult,
): RulesResult {
  return {
    violates,
    policy,
    confidence: Math.max(0, Math.min(100, Math.round(confidence))),
    evidence,
    source: "rules",
    rules_triggered: rulesTriggered,
    micro_score: microRules.score,
    micro_checks: microRules.checks,
  };
}

export function rulesEngine(input: RulesReview | string): RulesResult {
  const record = typeof input === "string" ? { text: input } : rulesReviewSchema.parse(input);
  const text = (record.text ?? record.reviewText ?? "").trim();
  const normalizedText = normalizeFingerprint(text);
  const reviewer = record.reviewer ?? {};
  const business = record.business ?? {};
  const competitorNames = record.competitorNames ?? business.competitorNames;
  const microRules = runMicroRules({
    text,
    ...(record.rating !== undefined ? { rating: record.rating } : {}),
    ...(record.reviewDate ? { reviewDate: record.reviewDate } : {}),
    ...(record.timeZone ? { timeZone: record.timeZone } : {}),
    ...(record.expectedLanguage ? { expectedLanguage: record.expectedLanguage } : {}),
    ...(business.name ? { businessName: business.name } : {}),
    ...(competitorNames ? { competitorNames } : {}),
    ...(record.reviewer ? { reviewer: record.reviewer } : {}),
    ...(record.history ? { history: record.history } : {}),
    ...(record.context || business.country
      ? {
          context: {
            ...record.context,
            ...(business.country ? { businessCountry: business.country } : {}),
          },
        }
      : {}),
  });
  const duplicateText =
    Boolean(record.duplicateText) ||
    Boolean(record.repeatedAcrossScans) ||
    (Array.isArray(record.duplicateReviewTexts) &&
      normalizedText.length > 0 &&
      record.duplicateReviewTexts.some((value) => normalizeFingerprint(value) === normalizedText));
  const reviewedBusinessCount = reviewer.reviewedBusinessCount ?? 0;
  const accountAgeDays = reviewer.accountAgeDays ?? 365;
  const hasPhoto = reviewer.hasPhoto ?? true;
  const reviewerName = normalize(reviewer.name);
  const ownerName = normalize(business.owner?.name);
  const forensicSignals: ForensicSignal[] = [
    {
      category: "biometrics",
      status: "not_assessed",
      confidence: 0,
      evidence: "Biometric identity or face matching is not collected or assessed.",
    },
  ];

  const ruleMatches: Array<{ policy: string; score: number; evidence: string }> = [];

  if (text.length < 20) {
    ruleMatches.push({
      policy: "fake_review",
      score: 38,
      evidence: captureEvidence(
        "Review length",
        "Review is too short to be a credible customer account.",
      ),
    });
  }
  if (reviewedBusinessCount >= 5) {
    ruleMatches.push({
      policy: "fake_review",
      score: 28,
      evidence: captureEvidence(
        "Reviewer behavior",
        `Reviewer has reviewed ${reviewedBusinessCount} businesses.`,
      ),
    });
  }
  if (accountAgeDays < 30) {
    ruleMatches.push({
      policy: "fake_review",
      score: 24,
      evidence: captureEvidence(
        "Account age",
        `Reviewer account is only ${accountAgeDays} days old.`,
      ),
    });
  }
  if (duplicateText) {
    ruleMatches.push({
      policy: "fake_review",
      score: 34,
      evidence: captureEvidence(
        "Duplicate review",
        "Review text matches a repeated or reused pattern across scans.",
      ),
    });
  }
  if (hasPhoto === false) {
    ruleMatches.push({
      policy: "fake_review",
      score: 18,
      evidence: captureEvidence(
        "Profile signal",
        "Reviewer profile has no photo, reducing trust signals.",
      ),
    });
  }

  const words = normalizedText.split(" ").filter(Boolean);
  const repeatedWord = words.length >= 8 && new Set(words).size / words.length <= 0.55;
  const letters = text.match(/[A-Za-z]/g) ?? [];
  const uppercaseLetters = text.match(/[A-Z]/g) ?? [];
  const excessiveCaps = letters.length >= 12 && uppercaseLetters.length / letters.length >= 0.8;
  const repeatedCharacters = /(.)\1{4,}/u.test(text);
  if (repeatedWord || excessiveCaps || repeatedCharacters) {
    const evidence = [
      repeatedWord ? "high repeated-word ratio" : null,
      excessiveCaps ? "excessive uppercase text" : null,
      repeatedCharacters ? "long repeated-character sequence" : null,
    ]
      .filter(Boolean)
      .join("; ");
    forensicSignals.push({
      category: "text",
      status: "observed",
      confidence: 55,
      evidence: captureEvidence("Text forensics", evidence),
    });
  }

  const fingerprintCandidates = [
    ...(record.duplicateReviewTexts ?? []),
    ...(record.comparisonReviewTexts ?? []),
  ];
  const nearDuplicate =
    normalizedText.length > 0 &&
    fingerprintCandidates.some(
      (candidate) =>
        normalizeFingerprint(candidate).length > 0 &&
        (normalizedText === normalizeFingerprint(candidate) ||
          tokenSimilarity(text, candidate) >= 0.82),
    );
  if (nearDuplicate) {
    forensicSignals.push({
      category: "digital_fingerprint",
      status: "observed",
      confidence: 82,
      evidence: "Normalized text or three-word shingles closely match another supplied review.",
    });
    if (!duplicateText) {
      ruleMatches.push({
        policy: "fake_review",
        score: 34,
        evidence: "Digital fingerprint: review text closely matches another supplied review.",
      });
    }
  }

  const negativeReviewRatio =
    reviewer.reviewedBusinessCount &&
    reviewer.reviewedBusinessCount > 0 &&
    reviewer.negativeReviewCount != null
      ? reviewer.negativeReviewCount / reviewer.reviewedBusinessCount
      : 0;
  if (
    (reviewer.recentReviewCount ?? 0) >= 10 ||
    ((reviewer.reviewedBusinessCount ?? 0) >= 10 &&
      (reviewer.negativeReviewCount ?? 0) >= 8 &&
      negativeReviewRatio >= 0.8)
  ) {
    forensicSignals.push({
      category: "reviewer",
      status: "observed",
      confidence: 55,
      evidence:
        (reviewer.recentReviewCount ?? 0) >= 10
          ? `Reviewer has ${reviewer.recentReviewCount} reviews in the supplied recent period.`
          : `${reviewer.negativeReviewCount} of ${reviewer.reviewedBusinessCount} supplied reviews are negative.`,
    });
  }

  if ((reviewer.sharedTargetBusinessCount ?? 0) >= 3) {
    forensicSignals.push({
      category: "network",
      status: "observed",
      confidence: 60,
      evidence: `Supplied reviewer-network data links activity to ${reviewer.sharedTargetBusinessCount} shared target businesses.`,
    });
  }

  const reviewTime = record.reviewDate ? Date.parse(record.reviewDate) : NaN;
  const futureDated = Number.isFinite(reviewTime) && reviewTime > Date.now() + 5 * 60 * 1000;
  const burstActivity =
    record.reviewsInWindow !== undefined &&
    record.windowMinutes !== undefined &&
    record.windowMinutes <= 30 &&
    record.reviewsInWindow >= 3;
  if (futureDated || burstActivity) {
    forensicSignals.push({
      category: "temporal",
      status: "observed",
      confidence: futureDated ? 70 : 60,
      evidence: futureDated
        ? "Supplied review timestamp is more than five minutes in the future."
        : `${record.reviewsInWindow} reviews were reported in a ${record.windowMinutes}-minute window.`,
    });
  }

  const urlPattern = /(https?:\/\/|www\.|maps\.google\.|goo\.gl\/|\bbit\.ly\b)/i;
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const phonePattern = /(?:\+?\d[\d\s().-]{7,}\d)/;
  const hasUrl = urlPattern.test(text);
  const hasPhone = phonePattern.test(text);
  const hasEmail = emailPattern.test(text);
  const promotional =
    promoPhrasePattern.test(text) ||
    promoPhrases.some((phrase) => text.toLowerCase().includes(phrase));
  const promotionalLikely =
    promoWordPattern.test(text) &&
    /(?:discount|offer|coupon|cashback|sale|click|buy|visit|call|book)/i.test(text);
  const directContactRequest =
    /\b(?:call me|text me|email me|message me|reach me|contact me|call me at|text me at|email me at|message me at|reach me at)\b/i.test(
      text,
    );
  const personalInfoDisclosure =
    /\b(?:my\s+(?:phone|number|email)|i\s+live\s+at|address\s+is|house\s*no|flat\s*no|street|road|lane|near|address)\b/i.test(
      text,
    );
  const spamCandidate =
    hasUrl ||
    hasEmail ||
    (promotional &&
      /(?:discount|offer|coupon|cashback|sale|click|buy|visit|call|book|special offer|limited time)/i.test(
        text,
      )) ||
    promotionalLikely ||
    Boolean(record.repeatedAcrossScans) ||
    (hasPhone && !directContactRequest && !personalInfoDisclosure);
  if (spamCandidate) {
    ruleMatches.push({
      policy: "spam",
      score:
        32 +
        (hasUrl ? 25 : 0) +
        (hasPhone ? 18 : 0) +
        (hasEmail ? 18 : 0) +
        (promotional || promotionalLikely ? 20 : 0),
      evidence: captureEvidence(
        "Spam signal",
        [
          hasUrl ? "Contains a URL" : null,
          hasPhone ? "Contains a phone number" : null,
          hasEmail ? "Contains an email address" : null,
          promotional || promotionalLikely ? "Contains promotional language" : null,
          record.repeatedAcrossScans ? "Repeated across scans" : null,
        ]
          .filter(Boolean)
          .join("; "),
      ),
    });
  }

  const conflictText =
    /\b(?:employee|employees|former employee|former staff|competitor|owner|employer|work here|used to work here|used to work at|ex-employee|ex employee)\b/i;
  const conflictMatch =
    conflictText.test(text) ||
    /(\bused to work here\b|\bformer employee\b|\bex-employee\b|\bex employee\b|\bworked here\b|\bwork here\b)/i.test(
      text,
    ) ||
    (reviewerName && ownerName && reviewerName === ownerName);
  if (conflictMatch || (reviewerName && ownerName && reviewerName === ownerName)) {
    const conflictEvidence =
      reviewerName && ownerName && reviewerName === ownerName
        ? `Reviewer name matches the business owner name: ${business.owner?.name ?? "unknown"}.`
        : "Review references employee/competitor/owner identity or relationship.";
    ruleMatches.push({
      policy: "conflict_of_interest",
      score:
        36 +
        (reviewerName && ownerName && reviewerName === ownerName ? 22 : 0) +
        (/(?:former employee|used to work here|worked here|employee|employer|competitor|owner)/i.test(
          text,
        )
          ? 14
          : 0),
      evidence: captureEvidence("Conflict signal", conflictEvidence),
    });
  }

  const hateMatch = [...hateWords].some((term) => text.toLowerCase().includes(term.toLowerCase()));
  const hasPersonalInfo =
    (hasPhone &&
      /\b(?:call me|text me|email me|message me|reach me|contact me|my\s+(?:phone|number|email)|i\s+live\s+at|address\s+is|house\s*no|flat\s*no|street|road|lane|near|address)\b/i.test(
        text,
      )) ||
    /\b(?:house\s*no|flat\s*no|street|road|lane|near|address)\b/i.test(text);
  const threatMatch = threatWords.some((term) => text.toLowerCase().includes(term.toLowerCase()));
  if (hateMatch || hasPersonalInfo || threatMatch) {
    ruleMatches.push({
      policy: "prohibited_content",
      score: 44 + (hateMatch ? 22 : 0) + (hasPersonalInfo ? 22 : 0) + (threatMatch ? 20 : 0),
      evidence: captureEvidence(
        "Prohibited content",
        [
          hateMatch ? "Contains hate or abusive language" : null,
          hasPersonalInfo ? "Contains personal/contact details or location identifiers" : null,
          threatMatch ? "Includes a direct threat or intimidation language" : null,
        ]
          .filter(Boolean)
          .join("; "),
      ),
    });
  }

  if (!ruleMatches.length) {
    return {
      ...buildResult(false, "none", 0, "No rule-based policy signal triggered.", 0, microRules),
      forensics: forensicSignals,
    };
  }

  const prohibitedMatch = ruleMatches.find((match) => match.policy === "prohibited_content");
  const primary = prohibitedMatch ?? [...ruleMatches].sort((a, b) => b.score - a.score)[0]!;
  let confidence = primary.score;
  if (ruleMatches.length > 1)
    confidence = Math.min(99, confidence + Math.min(18, ruleMatches.length * 8));
  if (primary.policy === "spam" && (hasUrl || promotional))
    confidence = Math.min(99, confidence + 10);
  if (primary.policy === "prohibited_content" && (hateMatch || threatMatch))
    confidence = Math.min(99, confidence + 12);

  return {
    ...buildResult(
      true,
      primary.policy,
      confidence,
      primary.evidence,
      ruleMatches.length,
      microRules,
    ),
    forensics: forensicSignals,
  };
}

export function rulesEngineSummary(
  text: string,
  reviewer?: RulesReview["reviewer"],
  business?: RulesReview["business"],
) {
  return rulesEngine({ text, reviewer, business });
}
