import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { LEGAL_CITATIONS } from "./legal-analysis";
import { learningPatterns } from "./memory";
import { loadCaseMemory } from "./memory.server";

export async function updateLearning(db: SupabaseClient<Database>) {
  const rows = await loadCaseMemory(db);
  const patterns = learningPatterns(rows);
  const snapshot = {
    generated_at: new Date().toISOString(),
    sample_size: rows.filter((row) => row.outcome !== "pending").length,
    patterns,
  };
  await db
    .from("learning_snapshots")
    .upsert({ id: "weekly", snapshot }, { onConflict: "id" })
    .throwOnError();
  return snapshot;
}

export async function loadLearningNotes(db: SupabaseClient<Database>) {
  const row = await db
    .from("learning_snapshots")
    .select("snapshot")
    .eq("id", "weekly")
    .maybeSingle()
    .throwOnError();
  if (!row.data) return [];
  const { z } = await import("zod");
  const snapshot = z
    .object({
      generated_at: z.string().datetime(),
      patterns: z.array(
        z.object({
          policy: z.string(),
          business: z.string(),
          band: z.number().int().min(0).max(4),
          approved: z.number().int().nonnegative(),
          total: z.number().int().min(10),
        }),
      ),
    })
    .parse(row.data.snapshot);
  if (Date.now() - Date.parse(snapshot.generated_at) > 8 * 86400000) return [];
  return snapshot.patterns
    .filter(
      (pattern) =>
        pattern.approved <= pattern.total &&
        LEGAL_CITATIONS.some((policy) => policy.type === pattern.policy),
    )
    .slice(0, 20)
    .map(
      (pattern) =>
        `Recorded historical cohort (${pattern.policy}, evidence band ${pattern.band * 20}-${pattern.band * 20 + 19}): ${pattern.approved}/${pattern.total} approved (${Math.round((pattern.approved / pattern.total) * 100)}%). Observational representative-entered cases, not proof about this review; do not override verified policy or source evidence.`,
    );
}
