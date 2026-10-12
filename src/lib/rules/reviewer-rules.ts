import { completeChecks, observed } from "./checks";
import type { RuleCheck, RuleReviewContext } from "./types";

export const REVIEWER_RULE_CATALOG = [
  "reviewer-account-under-seven-days",
  "reviewer-account-under-thirty-days",
  "reviewer-no-profile-photo",
  "reviewer-only-one-star-history",
  "reviewer-mostly-one-star-history",
  "reviewer-ten-reviews-hour",
  "reviewer-high-daily-volume",
  "reviewer-location-mismatch",
  "reviewer-same-time-daily",
  "reviewer-competitor-history",
  "reviewer-business-count-outlier",
  "reviewer-recent-review-burst",
  "reviewer-shared-review-text",
  "reviewer-same-business-repeat",
  "reviewer-repeated-low-ratings",
  "reviewer-profile-age-missing",
  "reviewer-photo-metadata-missing",
  "reviewer-location-metadata-missing",
  "reviewer-history-metadata-missing",
  "reviewer-activity-pattern-missing",
] as const;

export function evaluateReviewerRules(input: RuleReviewContext): RuleCheck[] {
  const checks = new Map<string, RuleCheck>();
  const put = (check: RuleCheck) => checks.set(check.id, check);
  const reviewer = input.reviewer;
  const history = input.history;
  const reviewCount = reviewer?.totalReviewCount ?? reviewer?.reviewedBusinessCount ?? null;
  const oneStarCount = reviewer?.oneStarReviewCount ?? null;
  const lowStarRatio =
    oneStarCount !== null && reviewCount !== null && reviewCount > 0
      ? oneStarCount / reviewCount
      : null;
  const locationMismatch =
    reviewer?.locationCountry && input.context?.businessCountry
      ? reviewer.locationCountry.toLocaleUpperCase() !==
        input.context.businessCountry.toLocaleUpperCase()
      : null;
  const postingHours = (reviewer?.postingTimes ?? [])
    .map((date) => /^(\d{1,2}):\d{2}$/u.exec(date)?.[1] ?? date.match(/T(\d{2}):/)?.[1])
    .filter((hour): hour is string => hour !== undefined);
  const sameHourDaily =
    postingHours.length >= 3 &&
    new Set(postingHours).size === 1 &&
    new Set((reviewer?.postingTimes ?? []).map((date) => date.slice(0, 10)).filter(Boolean)).size >=
      3;
  const currentReviewer = input.reviewer?.name?.trim().toLocaleLowerCase();
  const exactSharedText =
    currentReviewer && history?.length
      ? history.some(
          (item) =>
            item.reviewerName?.trim().toLocaleLowerCase() === currentReviewer &&
            normalize(item.text) === normalize(input.text),
        )
      : null;
  const competitorActivity =
    reviewer?.reviewedCompetitorNames && input.competitorNames
      ? reviewer.reviewedCompetitorNames.some((name) =>
          input.competitorNames!.some((competitor) => normalize(name) === normalize(competitor)),
        )
      : null;
  const reviewDate = input.reviewDate ? Date.parse(input.reviewDate) : NaN;
  const recentCount =
    Number.isFinite(reviewDate) && history
      ? history.filter((item) => {
          if (
            !item.publishedAt ||
            !currentReviewer ||
            item.reviewerName?.trim().toLocaleLowerCase() !== currentReviewer
          )
            return false;
          const timestamp = Date.parse(item.publishedAt);
          return (
            Number.isFinite(timestamp) &&
            reviewDate - timestamp <= 60 * 60 * 1000 &&
            reviewDate >= timestamp
          );
        }).length
      : null;

  put(
    observed(
      "reviewer-account-under-seven-days",
      "reviewer",
      reviewer?.accountAgeDays == null ? null : reviewer.accountAgeDays < 7,
      3,
      `Account age: ${reviewer?.accountAgeDays ?? "unknown"} days.`,
    ),
  );
  put(
    observed(
      "reviewer-account-under-thirty-days",
      "reviewer",
      reviewer?.accountAgeDays == null ? null : reviewer.accountAgeDays < 30,
      1,
      `Account age: ${reviewer?.accountAgeDays ?? "unknown"} days.`,
    ),
  );
  put(
    observed(
      "reviewer-no-profile-photo",
      "reviewer",
      reviewer?.hasPhoto == null ? null : !reviewer.hasPhoto,
      1,
      "Profile has no photo; anonymity is not evidence of a fake review.",
    ),
  );
  put(
    observed(
      "reviewer-only-one-star-history",
      "reviewer",
      lowStarRatio === null ? null : reviewCount === 1 && oneStarCount === 1,
      1,
      "Supplied profile history contains a single one-star review.",
    ),
  );
  put(
    observed(
      "reviewer-mostly-one-star-history",
      "reviewer",
      lowStarRatio === null ? null : reviewCount! >= 5 && lowStarRatio >= 0.8,
      2,
      `One-star review share in supplied history: ${lowStarRatio === null ? "unknown" : `${Math.round(lowStarRatio * 100)}%`}.`,
    ),
  );
  put(
    observed(
      "reviewer-ten-reviews-hour",
      "reviewer",
      reviewer?.reviewsInLastHour == null ? null : reviewer.reviewsInLastHour >= 10,
      4,
      `${reviewer?.reviewsInLastHour ?? 0} reviews reported in the previous hour.`,
    ),
  );
  put(
    observed(
      "reviewer-high-daily-volume",
      "reviewer",
      reviewer?.reviewsInLastHour == null ? null : reviewer.reviewsInLastHour >= 5,
      2,
      `${reviewer?.reviewsInLastHour ?? 0} reviews reported in the previous hour.`,
    ),
  );
  put(
    observed(
      "reviewer-location-mismatch",
      "reviewer",
      locationMismatch,
      1,
      "Supplied reviewer and business country differ; travel and other explanations are possible.",
    ),
  );
  put(
    observed(
      "reviewer-same-time-daily",
      "reviewer",
      reviewer?.postingTimes ? sameHourDaily : null,
      1,
      "Supplied reviewer review timestamps recur at the same displayed hour on multiple dates.",
    ),
  );
  put(
    observed(
      "reviewer-competitor-history",
      "reviewer",
      competitorActivity,
      2,
      "Supplied reviewer history includes one or more named competitors.",
    ),
  );
  put(
    observed(
      "reviewer-business-count-outlier",
      "reviewer",
      reviewer?.reviewedBusinessCount == null ? null : reviewer.reviewedBusinessCount >= 100,
      1,
      `Supplied profile has reviewed ${reviewer?.reviewedBusinessCount ?? 0} businesses; volume alone is not proof.`,
    ),
  );
  put(
    observed(
      "reviewer-recent-review-burst",
      "reviewer",
      recentCount === null ? null : recentCount >= 10,
      3,
      `${recentCount ?? 0} earlier supplied reviews fall within one hour of this review.`,
    ),
  );
  put(
    observed(
      "reviewer-shared-review-text",
      "reviewer",
      exactSharedText,
      2,
      "Same reviewer has a duplicate text entry in the supplied history.",
    ),
  );
  put(
    observed(
      "reviewer-same-business-repeat",
      "reviewer",
      history
        ? history.filter(
            (item) =>
              currentReviewer && item.reviewerName?.trim().toLocaleLowerCase() === currentReviewer,
          ).length > 1
        : null,
      1,
      "Multiple entries for the same reviewer appear in the supplied review history.",
    ),
  );
  put(
    observed(
      "reviewer-repeated-low-ratings",
      "reviewer",
      history
        ? history.filter(
            (item) =>
              currentReviewer &&
              item.reviewerName?.trim().toLocaleLowerCase() === currentReviewer &&
              item.rating === 1,
          ).length >= 5
        : null,
      2,
      "Supplied history contains repeated one-star reviews by the same reviewer.",
    ),
  );
  put(
    observed(
      "reviewer-profile-age-missing",
      "reviewer",
      reviewer?.accountAgeDays == null ? null : false,
      0,
      "Reviewer account age was not supplied.",
    ),
  );
  put(
    observed(
      "reviewer-photo-metadata-missing",
      "reviewer",
      reviewer?.hasPhoto == null ? null : false,
      0,
      "Reviewer photo metadata was not supplied.",
    ),
  );
  put(
    observed(
      "reviewer-location-metadata-missing",
      "reviewer",
      reviewer?.locationCountry == null ? null : false,
      0,
      "Reviewer location metadata was not supplied.",
    ),
  );
  put(
    observed(
      "reviewer-history-metadata-missing",
      "reviewer",
      history?.length ? false : null,
      0,
      "Reviewer historical review records were not supplied.",
    ),
  );
  put(
    observed(
      "reviewer-activity-pattern-missing",
      "reviewer",
      reviewer?.reviewsInLastHour != null || reviewer?.postingTimes?.length ? false : null,
      0,
      "Reviewer timing-activity metadata was not supplied.",
    ),
  );
  return completeChecks("reviewer", REVIEWER_RULE_CATALOG, checks);
}

function normalize(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
