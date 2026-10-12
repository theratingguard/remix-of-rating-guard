import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { notifySubmissionFollowup } from "./notifications.server";

export const SUBMISSION_FOLLOWUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

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

export function startSubmissionFollowupPolling(
  db: SupabaseClient<Database>,
  intervalMs = SUBMISSION_FOLLOWUP_INTERVAL_MS,
) {
  let running = false;
  const check = async () => {
    if (running) return;
    running = true;
    try {
      const result = await checkRemovalStatus(db);
      console.info("[submission-followup] completed", {
        checked: result.checked,
        checked_at: result.checked_at,
        google_polled: result.google_polled,
      });
    } catch (error) {
      console.error("[submission-followup] failed", error);
    } finally {
      running = false;
    }
  };

  void check();
  return setInterval(() => void check(), intervalMs);
}
