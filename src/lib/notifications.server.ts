import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export async function notifySubmissionFollowup(
  db: SupabaseClient<Database>,
  requestId: string,
  checkedAt: string,
) {
  const result = await db
    .rpc("record_submission_followup", {
      p_request_id: requestId,
      p_checked_at: checkedAt,
    })
    .throwOnError();
  return result.data;
}
