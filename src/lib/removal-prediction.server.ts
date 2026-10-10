import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getSettings } from "./settings.server";
import { historyCaseSchema, predictRemoval } from "./removal-prediction";
import type { LegalAnalysis } from "./legal-analysis";

export async function loadRemovalHistory(db: SupabaseClient<Database>) {
  if (!(await getSettings()).appeal_tracking_enabled) return [];
  const history = [];
  for (let offset = 0; ; offset += 500) {
    const result = await db
      .from("removal_history")
      .select("*")
      .order("id")
      .range(offset, offset + 499)
      .throwOnError();
    history.push(...result.data.map((row) => historyCaseSchema.parse(row)));
    if (result.data.length < 500) return history;
    if (history.length >= 50000)
      throw new Error(
        "Prediction history exceeds 50,000 cases; no truncated probability calculated.",
      );
  }
}
export async function enrichPredictions(
  db: SupabaseClient<Database>,
  legal: LegalAnalysis,
  businessType: string | null,
) {
  const history = await loadRemovalHistory(db);
  return {
    ...legal,
    reviews: legal.reviews.map((item) => {
      const strength = item.quality?.components.find(
        (component) => component.name === "Evidence strength",
      )?.score;
      return {
        ...item,
        prediction: predictRemoval(
          {
            policy_type: item.policy_type,
            business_type: businessType ?? "",
            evidence_strength: strength == null ? null : strength * 5,
            supported: item.violates_policy && Boolean(item.evidence_quote),
            review_id: item.review_id,
          },
          history,
        ),
      };
    }),
  };
}
