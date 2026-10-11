import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { notifySubmissionFollowup } from "./notifications.server";

export async function checkRemovalStatus(db: SupabaseClient<Database>, now = new Date()) {
  const checkedAt = now.toISOString();
  let checked = 0;
  for (let offset = 0; ; offset += 500) {
    const rows = await db
      .from("submission_status")
      .select("*")
      .eq("status", "submitted")
      .order("id")
      .range(offset, offset + 499)
      .throwOnError();
    for (const row of rows.data) {
      if (await notifySubmissionFollowup(db, row.removal_request_id, checkedAt)) checked++;
    }
    if (rows.data.length < 500) break;
    if (offset >= 49500)
      throw new Error("Pending submissions exceed the complete follow-up limit.");
  }
  return {
    checked,
    checked_at: checkedAt,
    google_polled: false,
    reason:
      "Places API exposes no moderation decision; authorized Google status capture is required.",
  };
}
