import type { AnalyzedReview } from "./data";
import type { LegalReview } from "./legal-analysis";
export function starBreakdown(reviews: Pick<AnalyzedReview, "rating">[]) {
  return [1, 2, 3, 4, 5].map((star) => reviews.filter((review) => review.rating === star).length);
}
export function removalBand(item?: LegalReview) {
  const score = item?.violates_policy ? item.prediction?.probability : null;
  if (score === null || score === undefined) return "not_estimable";
  return score >= 70 ? "high" : score >= 40 ? "medium" : "low";
}
export function removalSummary(items: LegalReview[], total: number) {
  const high = items.filter((item) => removalBand(item) === "high").length;
  const medium = items.filter((item) => removalBand(item) === "medium").length;
  const low = items.filter((item) => removalBand(item) === "low").length;
  return { high, medium, low, notEstimable: Math.max(0, total - high - medium - low) };
}
export function parseBulkInput(text: string) {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  const duplicates: string[] = [];
  for (const line of text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)) {
    if (line.length < 3 || line.length > 2000) {
      invalid.push(line);
      continue;
    }
    const key = /^https?:\/\//i.test(line) ? line : line.toLowerCase();
    if (seen.has(key)) {
      duplicates.push(line);
      continue;
    }
    seen.add(key);
    valid.push(line);
  }
  return { valid, invalid, duplicates };
}
export function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[\s]*[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
