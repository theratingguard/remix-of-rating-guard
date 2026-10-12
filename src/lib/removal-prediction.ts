import { z } from "zod";

export const historyCaseSchema = z.object({
  id: z.string().uuid(),
  review_id: z.string().uuid(),
  policy_type: z.string(),
  business_type: z.string(),
  evidence_strength: z.number().int().min(0).max(100).nullable(),
  outcome: z.enum(["approved", "rejected"]),
  days_to_response: z.number().int().nonnegative(),
  created_at: z.string(),
});
export type HistoryCase = z.infer<typeof historyCaseSchema>;
export const predictionSchema = z.object({
  version: z.literal("history-cohort-v1"),
  status: z.enum(["estimated", "low_confidence", "not_estimable", "unsupported"]),
  probability: z.number().int().min(0).max(100).nullable(),
  interval: z.tuple([z.number(), z.number()]).nullable(),
  sample_size: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  median_days: z.number().nonnegative().nullable(),
  basis: z.array(z.string()),
  unavailable: z.array(z.string()),
  generated_at: z.string(),
});
export type RemovalPrediction = z.infer<typeof predictionSchema>;
export const MIN_PREDICTION_CASES = 30;
export const LOW_CONFIDENCE_MIN_CASES = 10;
export function predictionBand(probability: number) {
  if (probability >= 80)
    return { label: "Very high estimated chance (not almost certain)", color: "#fee2e2" };
  if (probability >= 60) return { label: "High estimated chance", color: "#ffedd5" };
  if (probability >= 40) return { label: "Medium estimated chance", color: "#fef9c3" };
  return { label: "Low estimated chance", color: "#f1f5f9" };
}
const normalize = (value: string) => value.trim().toLowerCase();
export function predictRemoval(
  input: {
    policy_type: string;
    business_type: string;
    evidence_strength: number | null;
    supported: boolean;
    review_id: string;
  },
  history: HistoryCase[],
  now = new Date(),
): RemovalPrediction {
  if (
    input.evidence_strength !== null &&
    (!Number.isFinite(input.evidence_strength) ||
      input.evidence_strength < 0 ||
      input.evidence_strength > 100)
  )
    throw new Error("Prediction evidence strength must be 0–100 or unavailable.");
  const unavailable = [
    "Reviewer-wide history is not supplied by Google Places; no fake-account inference.",
    "Timing is not a trained predictor: no complete review timeline or dated business changes supplied.",
    "Outcomes are representative-entered records, not independently verified Google decisions.",
    "Observational cohort estimate, not a calibrated individual prediction or removal guarantee.",
  ];
  const cohort = [
    ...new Map(
      history
        .filter(
          (row) =>
            row.review_id !== input.review_id &&
            normalize(row.policy_type) === normalize(input.policy_type) &&
            normalize(row.business_type) === normalize(input.business_type) &&
            input.evidence_strength !== null &&
            row.evidence_strength !== null &&
            Math.floor(Math.min(99, row.evidence_strength) / 20) ===
              Math.floor(Math.min(99, input.evidence_strength) / 20) &&
            Number.isFinite(Date.parse(row.created_at)) &&
            Date.parse(row.created_at) <= now.getTime(),
        )
        .map((row) => [row.review_id, row]),
    ).values(),
  ];
  const approved = cohort.filter((row) => row.outcome === "approved").length;
  const basis = [
    `Exact policy cohort: ${input.policy_type || "unavailable"}.`,
    `Exact business-type cohort: ${input.business_type || "unavailable"}.`,
    `Evidence strength: ${input.evidence_strength === null ? "unavailable" : `${input.evidence_strength}/100; matching 20-point band`}.`,
    `${approved}/${cohort.length} comparable decided cases approved; current review excluded; duplicate reviews counted once.`,
  ];
  const supported = input.supported && input.evidence_strength !== null;
  const enough = supported && cohort.length >= MIN_PREDICTION_CASES;
  const lowConfidence = supported && cohort.length >= LOW_CONFIDENCE_MIN_CASES && !enough;
  const n = cohort.length,
    p = n ? approved / n : 0,
    z = 1.96;
  const center = n ? (p + (z * z) / (2 * n)) / (1 + (z * z) / n) : 0;
  const half = n
    ? (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n)
    : 0;
  const days = cohort.map((row) => row.days_to_response).sort((a, b) => a - b);
  return {
    version: "history-cohort-v1",
    status: !supported
      ? "unsupported"
      : enough
        ? "estimated"
        : lowConfidence
          ? "low_confidence"
          : "not_estimable",
    probability: enough ? Math.round(p * 100) : null,
    interval: enough
      ? [
          Math.max(0, Math.round((center - half) * 100)),
          Math.min(100, Math.round((center + half) * 100)),
        ]
      : null,
    sample_size: n,
    approved,
    median_days: enough ? (days[Math.floor((n - 1) / 2)]! + days[Math.floor(n / 2)]!) / 2 : null,
    basis: enough
      ? basis
      : [
          ...basis,
          lowConfidence
            ? `Low confidence: ${cohort.length} comparable decisions are below the ${MIN_PREDICTION_CASES}-case reporting threshold; no percentage is shown.`
            : `Not estimable: fewer than ${LOW_CONFIDENCE_MIN_CASES} comparable decided cases or supported evidence is unavailable; no percentage is shown.`,
        ],
    unavailable,
    generated_at: now.toISOString(),
  };
}
