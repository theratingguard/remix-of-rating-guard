import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { strategyNotes } from "./removal-workflow";

export async function loadOutcomeStrategyNotes(db: SupabaseClient<Database>) {
  const rows = await db
    .from("removal_outcomes")
    .select("policy_type,business_type,outcome", { count: "exact" })
    .limit(5000);
  if (rows.error) throw new Error("Could not load recorded outcome evidence for analysis.");
  if ((rows.count ?? 0) > 5000)
    throw new Error("Outcome evidence exceeds the supported complete-sample limit.");
  return strategyNotes(rows.data);
}
