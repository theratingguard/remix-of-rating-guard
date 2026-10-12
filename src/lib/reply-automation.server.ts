import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createReplyDraft } from "./reply-draft.server";

const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MAX_DRAFTS_PER_USER_PER_RUN = 10;
const MAX_DRAFTS_PER_RUN = 25;
export const REPLY_AUTOMATION_INTERVAL_MS = 6 * 60 * 60 * 1000;

export async function generateAutomaticReplyDrafts(db: SupabaseClient<Database>, now = new Date()) {
  const preferences = await db
    .from("auto_reply_preferences")
    .select("user_id")
    .eq("enabled", true)
    .limit(1000)
    .throwOnError();
  const cutoff = new Date(now.getTime() - LOOKBACK_MS).toISOString();
  let generated = 0;
  let failed = 0;
  let attempted = 0;

  for (const preference of preferences.data) {
    if (attempted >= MAX_DRAFTS_PER_RUN) break;
    const recent = await db
      .from("reviews")
      .select("id,scans!inner(user_id,status)")
      .eq("scans.user_id", preference.user_id)
      .eq("scans.status", "complete")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(100)
      .throwOnError();
    const reviewIds = recent.data.map((review) => review.id);
    if (!reviewIds.length) continue;

    const existing = await db
      .from("auto_replies")
      .select("review_id")
      .eq("user_id", preference.user_id)
      .in("review_id", reviewIds)
      .throwOnError();
    const drafted = new Set(existing.data.map((reply) => reply.review_id));
    let userAttempts = 0;

    for (const review of recent.data) {
      if (
        drafted.has(review.id) ||
        userAttempts >= MAX_DRAFTS_PER_USER_PER_RUN ||
        attempted >= MAX_DRAFTS_PER_RUN
      )
        continue;
      attempted++;
      userAttempts++;
      try {
        const result = await createReplyDraft(
          db,
          preference.user_id,
          review.id,
          "professional",
          "automatic",
        );
        if (result.ok) {
          generated++;
        } else {
          failed++;
          console.warn("[auto-reply] Draft was not generated", {
            review_id: review.id,
            message: result.message,
          });
        }
      } catch (error) {
        failed++;
        console.error("[auto-reply] Draft generation failed", {
          review_id: review.id,
          error,
        });
      }
    }
  }
  return { generated, failed, attempted, checked_at: now.toISOString() };
}

export function startReplyAutomation(
  db: SupabaseClient<Database>,
  intervalMs = REPLY_AUTOMATION_INTERVAL_MS,
) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      console.info("[auto-reply] Sweep completed", await generateAutomaticReplyDrafts(db));
    } catch (error) {
      console.error("[auto-reply] Sweep failed", error);
    } finally {
      running = false;
    }
  };
  void run();
  return setInterval(() => void run(), intervalMs);
}
