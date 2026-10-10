import { z } from "zod";
import type { AnalyzedReview } from "./data";
import type { LegalReview } from "./legal-analysis";

const componentSchema = z.object({
  name: z.string(),
  score: z.number().int().min(0).max(20).nullable(),
  basis: z.string(),
});
export const reviewQualitySchema = z.object({
  version: z.literal("quality-v1"),
  total: z.number().int().min(0).max(100),
  assessed: z.number().int().min(0).max(5),
  components: z.array(componentSchema).length(5),
  findings: z.array(z.string()).max(20),
  unavailable: z.array(z.string()).max(10),
  sample_size: z.number().int().nonnegative(),
});
export type ReviewQuality = z.infer<typeof reviewQualitySchema>;
export function readinessBand(score: number) {
  if (score >= 90) return { label: "Very high readiness", color: "#fee2e2" };
  if (score >= 70) return { label: "High readiness", color: "#ffedd5" };
  if (score >= 50) return { label: "Medium readiness", color: "#fef9c3" };
  return { label: "Low readiness", color: "#f1f5f9" };
}
function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export function collectSampleEvidence(review: AnalyzedReview, sample: AnalyzedReview[]) {
  const findings: string[] = [];
  const text = normalize(review.text ?? "");
  const words = new Set(text.split(/\s+/).filter(Boolean));
  for (const other of sample.filter((item) => item.id !== review.id)) {
    const otherText = normalize(other.text ?? "");
    if (words.size >= 5 && text === otherText) {
      findings.push(
        `Matching normalized text in fetched review ${other.id}; duplication is an investigative lead, not proof of spam or a fake account.`,
      );
    } else if (words.size >= 5) {
      const otherWords = new Set(otherText.split(/\s+/).filter(Boolean));
      const intersection = [...words].filter((word) => otherWords.has(word)).length;
      const union = new Set([...words, ...otherWords]).size;
      if (otherWords.size >= 5 && intersection / union >= 0.8)
        findings.push(
          `At least 80% token-set overlap with fetched review ${other.id}; similarity does not establish bot authorship.`,
        );
    }
  }
  const date = review.published_at ? Date.parse(review.published_at) : NaN;
  if (Number.isFinite(date)) {
    const day = new Date(date).toISOString().slice(0, 10);
    const count = sample.filter((item) => {
      const timestamp = item.published_at ? Date.parse(item.published_at) : NaN;
      return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === day;
    }).length;
    findings.push(
      `${count} of ${sample.length} fetched reviews published on ${day} (UTC). This limited sample cannot establish a review burst across all business reviews.`,
    );
  }
  findings.push(
    `Fetched sample: ${sample.length} reviews. A 1-star rating alone is not evidence of a policy violation.`,
  );
  const consensus = z
    .object({
      votes: z
        .array(
          z.object({
            model: z.string(),
            violates_policy: z.boolean(),
            quote: z.string(),
            reason: z.string(),
          }),
        )
        .length(3),
    })
    .safeParse(review.analysis?.verification);
  if (consensus.success) {
    for (const vote of consensus.data.votes)
      findings.push(
        `${vote.model}: ${vote.violates_policy ? "supported policy concern" : "no supported policy concern"}. Quote: ${vote.quote || "None"}. ${vote.reason}`,
      );
  }
  return findings;
}

export function assessReviewQuality(
  item: LegalReview,
  review: AnalyzedReview,
  sample: AnalyzedReview[],
): ReviewQuality {
  const supported =
    item.violates_policy &&
    Boolean(item.evidence_quote.trim()) &&
    Boolean(review.text?.includes(item.evidence_quote));
  const components = [
    {
      name: "Policy clarity",
      score: supported ? 20 : 0,
      basis: supported
        ? `Validated policy heading: ${item.policy_section}. Google must assess applicability.`
        : "No substantiated policy concern.",
    },
    {
      name: "Evidence strength",
      score: supported ? 10 : 0,
      basis: supported
        ? "Verbatim source quote available; no independent supporting documents verified (10 of 20)."
        : "No supported evidence quote.",
    },
    {
      name: "Google precedent",
      score: null,
      basis: "No verified comparable Google decision supplied; not inferred from model memory.",
    },
    {
      name: "Legal grounds",
      score: null,
      basis: "No jurisdiction or counsel-verified legal assessment supplied.",
    },
    {
      name: "Removal history",
      score: null,
      basis: "No verified business-specific removal history supplied to this assessment.",
    },
  ];
  return {
    version: "quality-v1",
    total: components.reduce((sum, component) => sum + (component.score ?? 0), 0),
    assessed: components.filter((component) => component.score !== null).length,
    components,
    sample_size: sample.length,
    findings: collectSampleEvidence(review, sample),
    unavailable: [
      "Reviewer-wide review counts, rating history, duplicate-business activity and competitor reviews are not provided by Places API.",
      "Reviewer names do not establish identity, employment or competitor affiliation.",
      "Renovation, ownership changes and post-review events require dated business records.",
      "Language patterns cannot reliably prove bot authorship or a fake account.",
    ],
  };
}
