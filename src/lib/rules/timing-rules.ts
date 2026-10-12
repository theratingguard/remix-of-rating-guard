import { completeChecks, observed } from "./checks";
import type { RuleCheck, RuleReviewContext } from "./types";

export const TIMING_RULE_CATALOG = [
  "timing-public-holiday",
  "timing-three-am-local",
  "timing-after-competitor-review",
  "timing-after-business-event",
  "timing-within-day-of-event",
  "timing-future-timestamp",
  "timing-reviews-in-short-window",
  "timing-weekend-post",
  "timing-midnight-post",
  "timing-repeated-hour-daily",
  "timing-burst-same-day",
  "timing-review-date-missing",
  "timing-timezone-missing",
  "timing-holiday-calendar-missing",
  "timing-business-event-history-missing",
] as const;

export function evaluateTimingRules(input: RuleReviewContext): RuleCheck[] {
  const checks = new Map<string, RuleCheck>();
  const put = (check: RuleCheck) => checks.set(check.id, check);
  const date = input.reviewDate ? new Date(input.reviewDate) : null;
  const validDate = date && Number.isFinite(date.getTime());
  const localParts = validDate && input.timeZone ? localClock(date, input.timeZone) : null;
  const eventDates = input.context?.businessEventDates ?? [];
  const nearEvent =
    validDate && eventDates.length
      ? eventDates.some((event) => isWithin(date, event, 24 * 60 * 60 * 1000))
      : null;
  const afterEvent =
    validDate && eventDates.length
      ? eventDates.some((event) => {
          const eventTime = Date.parse(event);
          return (
            Number.isFinite(eventTime) &&
            date.getTime() >= eventTime &&
            date.getTime() - eventTime <= 7 * 86400000
          );
        })
      : null;
  const previousCompetitorAt = input.context?.previousCompetitorReviewAt;
  const competitorInterval =
    validDate && previousCompetitorAt ? date.getTime() - Date.parse(previousCompetitorAt) : null;
  const sameDayCount =
    validDate && input.history
      ? input.history.filter((item) => {
          if (!item.publishedAt || item.rating !== 1) return false;
          const timestamp = new Date(item.publishedAt);
          return timestamp.toDateString() === date.toDateString();
        }).length
      : null;

  put(
    observed(
      "timing-public-holiday",
      "temporal",
      input.context?.isPublicHoliday ?? null,
      1,
      "Review timestamp falls on a supplied public holiday; timing alone is not evidence of manipulation.",
    ),
  );
  put(
    observed(
      "timing-three-am-local",
      "temporal",
      localParts ? localParts.hour === 3 : null,
      1,
      `Displayed local review hour: ${localParts?.hour ?? "unknown"}.`,
    ),
  );
  put(
    observed(
      "timing-after-competitor-review",
      "temporal",
      competitorInterval === null
        ? null
        : competitorInterval >= 0 && competitorInterval <= 24 * 60 * 60 * 1000,
      1,
      "Review was posted within 24 hours after a supplied competitor-review timestamp.",
    ),
  );
  put(
    observed(
      "timing-after-business-event",
      "temporal",
      afterEvent,
      1,
      "Review was posted within seven days after a supplied business-event date; verify context.",
    ),
  );
  put(
    observed(
      "timing-within-day-of-event",
      "temporal",
      nearEvent,
      1,
      "Review was posted within one day of a supplied business event.",
    ),
  );
  put(
    observed(
      "timing-future-timestamp",
      "temporal",
      validDate ? date.getTime() > Date.now() + 5 * 60 * 1000 : null,
      2,
      "Review timestamp is more than five minutes in the future.",
    ),
  );
  put(
    observed(
      "timing-reviews-in-short-window",
      "temporal",
      input.reviewer?.reviewsInLastHour == null ? null : input.reviewer.reviewsInLastHour >= 5,
      2,
      `${input.reviewer?.reviewsInLastHour ?? 0} reviews reported within one hour.`,
    ),
  );
  put(
    observed(
      "timing-weekend-post",
      "temporal",
      validDate ? date.getDay() === 0 || date.getDay() === 6 : null,
      0,
      "Review was posted on a weekend; this is not evidence of manipulation.",
    ),
  );
  put(
    observed(
      "timing-midnight-post",
      "temporal",
      localParts ? localParts.hour === 0 : null,
      0,
      `Displayed local review hour: ${localParts?.hour ?? "unknown"}.`,
    ),
  );
  const postingTimes = input.reviewer?.postingTimes;
  const postingHours = postingTimes?.map(
    (value) => /^(\d{1,2}):/u.exec(value)?.[1] ?? value.match(/T(\d{2}):/)?.[1],
  );
  put(
    observed(
      "timing-repeated-hour-daily",
      "temporal",
      postingHours && postingTimes
        ? postingHours.length >= 3 &&
            new Set(postingHours).size === 1 &&
            new Set(postingTimes.map((value) => value.slice(0, 10))).size >= 3
        : null,
      1,
      "Supplied posting history repeats at the same displayed hour on separate dates.",
    ),
  );
  put(
    observed(
      "timing-burst-same-day",
      "temporal",
      sameDayCount === null ? null : sameDayCount >= 5,
      2,
      `${sameDayCount ?? 0} other one-star reviews appear on the same calendar day in supplied history.`,
    ),
  );
  put(
    observed(
      "timing-review-date-missing",
      "temporal",
      input.reviewDate ? false : null,
      0,
      "Review timestamp was not supplied.",
    ),
  );
  put(
    observed(
      "timing-timezone-missing",
      "temporal",
      validDate && input.timeZone ? false : null,
      0,
      "No time-zone metadata was supplied; local posting hour cannot be assessed.",
    ),
  );
  put(
    observed(
      "timing-holiday-calendar-missing",
      "temporal",
      input.context?.isPublicHoliday === undefined ? null : false,
      0,
      "No jurisdiction-specific holiday calendar was supplied.",
    ),
  );
  put(
    observed(
      "timing-business-event-history-missing",
      "temporal",
      eventDates.length > 0 ? false : null,
      0,
      "No business-event dates were supplied.",
    ),
  );
  return completeChecks("temporal", TIMING_RULE_CATALOG, checks);
}

function localClock(date: Date, timeZone: string) {
  try {
    const hour = new Intl.DateTimeFormat("en", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .find((part) => part.type === "hour")?.value;
    return hour === undefined ? null : { hour: Number(hour) };
  } catch {
    return null;
  }
}

function isWithin(date: Date, otherDate: string, milliseconds: number) {
  const timestamp = Date.parse(otherDate);
  return Number.isFinite(timestamp) && Math.abs(date.getTime() - timestamp) <= milliseconds;
}
