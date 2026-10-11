import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { strategyNotes } from "./removal-workflow";
import { getSettings } from "./settings.server";

export async function loadOutcomeStrategyNotes(db: SupabaseClient<Database>) {
  if (!(await getSettings()).appeal_tracking_enabled) return [];
  const rows = await db
    .from("removal_outcomes")
    .select("policy_type,business_type,outcome", { count: "exact" })
    .limit(5000);
  if (rows.error) throw new Error("Could not load recorded outcome evidence for analysis.");
  if ((rows.count ?? 0) > 5000)
    throw new Error("Outcome evidence exceeds the supported complete-sample limit.");
  const { loadLearningNotes } = await import("./learning.server");
  return [...strategyNotes(rows.data), ...(await loadLearningNotes(db))];
}
