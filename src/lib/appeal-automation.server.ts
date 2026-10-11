import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generateRejectedAppeal } from "./appeal.server";

export async function prepareRecordedRejectionAppeal(
  db: SupabaseClient<Database>,
  requestId: string,
) {
  // Existing generator requires a recorded rejection and exact validated source evidence.
  return generateRejectedAppeal(db, requestId);
}
