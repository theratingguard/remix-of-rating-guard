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

export function startWeeklyLearningRefresh(
  db: SupabaseClient<Database>,
  intervalMs = 7 * 24 * 60 * 60 * 1000,
) {
  let running = false;
  const refresh = async () => {
    if (running) return;
    running = true;
    try {
      const snapshot = await updateLearning(db);
      console.info("[learning] Weekly outcome snapshot refreshed", {
        sampleSize: snapshot.sample_size,
        patterns: snapshot.patterns.length,
      });
    } catch (error) {
      console.error("[learning] Weekly outcome snapshot refresh failed", error);
    } finally {
      running = false;
    }
  };
  void refresh();
  return setInterval(() => void refresh(), intervalMs);
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
        `Recorded historical cohort (${pattern.policy}, evidence band ${pattern.band * 20}-${pattern.band * 20 + 19}): ${pattern.approved} approved and ${pattern.total - pattern.approved} rejected of ${pattern.total} decisions (${Math.round((pattern.approved / pattern.total) * 100)}% approval). Observational, manually recorded outcomes only; use failures as caution, not a reason to reject supported evidence or override policy.`,
    );
}
