export const RULE_GROUPS = [
  "text",
  "reviewer",
  "temporal",
  "crossPlatform",
  "network",
  "semantic",
  "pattern",
  "language",
] as const;

export type RuleGroup = (typeof RULE_GROUPS)[number];
export type RuleCheckStatus = "flagged" | "clear" | "not_assessed" | "context";

export type RuleCheck = {
  id: string;
  group: RuleGroup;
  status: RuleCheckStatus;
  points: number;
  evidence: string | null;
};

export type RuleReviewContext = {
  text: string;
  rating?: number | undefined;
  reviewDate?: string | undefined;
  timeZone?: string | undefined;
  businessName?: string | undefined;
  competitorNames?: string[] | undefined;
  expectedLanguage?: string | undefined;
  reviewer?:
    | {
        name?: string | null | undefined;
        accountAgeDays?: number | null | undefined;
        hasPhoto?: boolean | null | undefined;
        reviewedBusinessCount?: number | null | undefined;
        oneStarReviewCount?: number | null | undefined;
        totalReviewCount?: number | null | undefined;
        reviewsInLastHour?: number | null | undefined;
        locationCountry?: string | null | undefined;
        postingTimes?: string[] | undefined;
        reviewedCompetitorNames?: string[] | undefined;
      }
    | undefined;
  history?:
    | Array<{
        text: string;
        rating?: number | undefined;
        publishedAt?: string | undefined;
        reviewerName?: string | undefined;
        platform?: string | undefined;
        businessName?: string | undefined;
      }>
    | undefined;
  context?:
    | {
        isPublicHoliday?: boolean | undefined;
        previousCompetitorReviewAt?: string | undefined;
        businessEventDates?: string[] | undefined;
        sameReviewerCompetitorCount?: number | undefined;
        sameDayOneStarCount?: number | undefined;
        multiPlatformPattern?: boolean | undefined;
        photoOrReceiptAvailable?: boolean | undefined;
        exactNames?: string[] | undefined;
        exactDates?: string[] | undefined;
        exactAmounts?: string[] | undefined;
        explicitlyVagueTiming?: boolean | undefined;
        hearsayOnly?: boolean | undefined;
        businessCountry?: string | undefined;
      }
    | undefined;
};

export type RuleGroupScore = {
  score: number;
  maxScore: number;
  checks: number;
  assessed: number;
  flagged: number;
};

export type RuleScore = {
  score: number;
  band: "high" | "medium" | "low" | "normal";
  checksRun: number;
  checksAssessed: number;
  checksFlagged: number;
  durationMs: number;
  groups: Record<RuleGroup, RuleGroupScore>;
};

export type MicroRuleResult = {
  checks: RuleCheck[];
  score: RuleScore;
};
