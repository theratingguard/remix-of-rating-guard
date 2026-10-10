import { z } from "zod";
import { outcomeSummary } from "./removal-workflow";
const sampledReview = z.object({
  id: z.string(),
  author: z.string(),
  rating: z.number(),
  text: z.string().nullable(),
  published_at: z.string().nullable(),
  scan_id: z.string(),
  business_id: z.string().nullable(),
  business_name: z.string().nullable(),
  fetched_at: z.string(),
  risk: z.string().nullable(),
  category: z.string().nullable(),
  business_type: z.string().nullable(),
});
export const alertsSampleSchema = z.object({
  generated_at: z.string(),
  since: z.string(),
  reviews: z.array(sampledReview),
  outcomes: z.array(
    z.object({ id: z.string(), outcome: z.enum(["approved", "rejected", "pending"]) }),
  ),
  approved_this_week: z.number().int().nonnegative(),
  rejected_this_week: z.number().int().nonnegative(),
});
export function buildSmartAlerts(sample: z.infer<typeof alertsSampleSchema>) {
  const flagged = sample.reviews.filter(
    (review) => review.risk === "high" || review.risk === "medium",
  );
  const policies = new Map<string, number>();
  for (const review of flagged) {
    const category = review.category ?? "Unclassified concern";
    policies.set(category, (policies.get(category) ?? 0) + 1);
  }
  const trends = [...policies]
    .map(([policy, count]) => ({
      policy,
      count,
      percent: Math.round((count / flagged.length) * 100),
    }))
    .sort((a, b) => b.count - a.count);
  const types = [
    ...new Set(
      flagged.map((review) => review.business_type).filter((type): type is string => Boolean(type)),
    ),
  ];
  const businessTrends = types.flatMap((type) => {
    const rows = flagged.filter((review) => review.business_type === type);
    if (rows.length < 5) return [];
    const counts = new Map<string, number>();
    for (const row of rows) {
      const policy = row.category ?? "Unclassified concern";
      counts.set(policy, (counts.get(policy) ?? 0) + 1);
    }
    return [...counts].map(([policy, count]) => ({
      type,
      policy,
      count,
      total: rows.length,
      percent: Math.round((count / rows.length) * 100),
    }));
  });
  const patterns: string[] = [];
  const seen = new Set<string>();
  for (const review of sample.reviews) {
    const text = review.text
      ?.toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
    if (!text || text.split(/\s+/).length < 5) continue;
    const key = `${review.scan_id}:${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const matches = sample.reviews.filter(
      (other) =>
        other.scan_id === review.scan_id &&
        other.text
          ?.toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, " ")
          .trim() === text,
    );
    if (matches.length >= 2)
      patterns.push(
        `${review.business_name ?? "Business"}: ${matches.length} fetched reviews have matching normalized text. Investigative lead, not proof of spam.`,
      );
  }
  const today = sample.generated_at.slice(0, 10);
  const todayReviews = sample.reviews.filter(
    (review) => review.published_at?.slice(0, 10) === today,
  );
  return {
    sampleSize: sample.reviews.length,
    flagged: flagged.length,
    trends,
    businessTrends,
    patterns,
    today: {
      sampleSize: todayReviews.length,
      flagged: todayReviews.filter((review) => review.risk === "high" || review.risk === "medium")
        .length,
    },
    weekly: {
      ...outcomeSummary(sample.outcomes),
      approvedThisWeek: sample.approved_this_week,
      rejectedThisWeek: sample.rejected_this_week,
    },
  };
}
export function compareBusinesses(
  own: { id: string; name: string; total_reviews: number | null; rating: number | null },
  competitor: { id: string; name: string; total_reviews: number | null; rating: number | null },
) {
  if (own.id === competitor.id) throw new Error("Choose two different scanned businesses.");
  const shortfall =
    own.total_reviews !== null &&
    competitor.total_reviews !== null &&
    competitor.total_reviews > own.total_reviews
      ? Math.round(
          ((competitor.total_reviews - own.total_reviews) / competitor.total_reviews) * 100,
        )
      : null;
  return { own, competitor, shortfall };
}
