import { z } from "zod";

export const memoryCaseSchema = z.object({
  id: z.string().uuid(),
  review_id: z.string().uuid(),
  business_type: z.string(),
  policy_type: z.string(),
  evidence_pattern: z.string(),
  evidence_strength: z.number().int().min(0).max(100).nullable(),
  review_text: z.string(),
  outcome: z.enum(["approved", "rejected", "pending"]),
  days_to_response: z.number().int().nonnegative().nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
export type MemoryCase = z.infer<typeof memoryCaseSchema>;
export const memoryReviewSchema = z.object({
  review_id: z.string().uuid(),
  business_type: z.string().min(1).max(200),
  policy_type: z.string().max(200),
  evidence_strength: z.number().int().min(0).max(100).nullable(),
  review_text: z.string().max(20000),
  supported: z.boolean(),
});
export type MemoryReview = z.infer<typeof memoryReviewSchema>;
const normalize = (text: string) => text.trim().toLowerCase();
const tokens = (text: string) => new Set(normalize(text).match(/[\p{L}\p{N}]{3,}/gu) ?? []);

export function similarMemoryCases(input: MemoryReview, rows: MemoryCase[], now = new Date()) {
  memoryReviewSchema.parse(input);
  const words = tokens(input.review_text);
  return [...new Map(rows.map((row) => [row.review_id, row])).values()]
    .filter(
      (row) =>
        row.review_id !== input.review_id &&
        row.outcome !== "pending" &&
        Date.parse(row.updated_at) <= now.getTime() &&
        normalize(row.policy_type) === normalize(input.policy_type),
    )
    .map((row) => {
      const other = tokens(row.review_text);
      const union = new Set([...words, ...other]).size;
      const overlap = [...words].filter((word) => other.has(word)).length;
      return {
        ...row,
        similarity:
          (normalize(row.business_type) === normalize(input.business_type) ? 0.5 : 0) +
          (input.evidence_strength !== null && row.evidence_strength !== null
            ? 0.3 * (1 - Math.abs(input.evidence_strength - row.evidence_strength) / 100)
            : 0) +
          (union ? (0.2 * overlap) / union : 0),
      };
    })
    .sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id))
    .slice(0, 10);
}

export function memoryPrediction(input: MemoryReview, rows: MemoryCase[], now = new Date()) {
  memoryReviewSchema.parse(input);
  const comparable = [
    ...new Map(
      rows
        .filter(
          (row) =>
            row.review_id !== input.review_id &&
            row.outcome !== "pending" &&
            Date.parse(row.updated_at) <= now.getTime() &&
            normalize(row.policy_type) === normalize(input.policy_type) &&
            normalize(row.business_type) === normalize(input.business_type) &&
            input.evidence_strength !== null &&
            row.evidence_strength !== null &&
            Math.floor(Math.min(99, input.evidence_strength) / 20) ===
              Math.floor(Math.min(99, row.evidence_strength) / 20),
        )
        .map((row) => [row.review_id, row]),
    ).values(),
  ];
  const n = comparable.length;
  const approved = comparable.filter((row) => row.outcome === "approved").length;
  const enough = input.supported && input.evidence_strength !== null && n >= 10;
  const p = n ? approved / n : 0;
  const z = 1.96;
  const center = (p + (z * z) / (2 * Math.max(1, n))) / (1 + (z * z) / Math.max(1, n));
  const half =
    (z * Math.sqrt((p * (1 - p)) / Math.max(1, n) + (z * z) / (4 * Math.max(1, n) ** 2))) /
    (1 + (z * z) / Math.max(1, n));
  return {
    version: "case-memory-cohort-v1" as const,
    status: enough ? ("estimated" as const) : ("insufficient_data" as const),
    removal_likelihood: enough ? Math.round(p * 100) : null,
    confidence_interval: enough
      ? ([
          Math.max(0, Math.round((center - half) * 100)),
          Math.min(100, Math.round((center + half) * 100)),
        ] as [number, number])
      : null,
    sample_size: n,
    reasoning: `${enough ? `${approved}/${n} comparable cases approved.` : "Not enough data: at least 10 comparable decided cases and supported evidence required."} Exact policy/business type and matching evidence-strength band; pending, current, duplicate and future decisions excluded. Representative-entered outcomes, not independently verified Google decisions; observational estimate, not a calibrated removal guarantee.`,
    similar_cases: similarMemoryCases(input, comparable, now).map((row) => row.id),
    generated_at: now.toISOString(),
  };
}

export function learningPatterns(rows: MemoryCase[], now = new Date()) {
  const groups = new Map<
    string,
    { policy: string; business: string; band: number; approved: number; total: number }
  >();
  const unique = new Map(rows.map((row) => [row.review_id, row]));
  for (const row of unique.values()) {
    if (
      row.outcome === "pending" ||
      row.evidence_strength === null ||
      Date.parse(row.updated_at) > now.getTime() ||
      !row.policy_type.trim()
    )
      continue;
    const band = Math.floor(Math.min(99, row.evidence_strength) / 20);
    const key = JSON.stringify([normalize(row.policy_type), normalize(row.business_type), band]);
    const group = groups.get(key) ?? {
      policy: row.policy_type,
      business: row.business_type,
      band,
      approved: 0,
      total: 0,
    };
    group.total++;
    if (row.outcome === "approved") group.approved++;
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((group) => group.total >= 10)
    .sort((a, b) => b.total - a.total || a.policy.localeCompare(b.policy));
}
