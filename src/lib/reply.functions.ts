import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createReplyDraft } from "./reply-draft.server";
import { REPLY_TONES, type ReplySuggestion } from "./reply-config";

export { isReplyTone, REPLY_MODEL, REPLY_TONES } from "./reply-config";
export type { ReplySuggestion } from "./reply-config";

export type ReplyDraft = {
  id: string;
  reply_text: string;
  status: "draft" | "approved" | "rejected";
  tone: string;
  model: string;
  created_at: string;
};

export type ReplyDraftListItem = ReplyDraft & {
  review: { author: string; rating: number; text: string | null; review_url: string | null };
  businessName: string;
};

/** Review intelligence and an editable, persisted reply draft; never posted automatically. */
export const suggestReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ reviewId: z.string().uuid(), tone: z.enum(REPLY_TONES) }).parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; suggestion: ReplySuggestion } | { ok: false; message: string }> => {
      return createReplyDraft(context.supabase, context.userId, data.reviewId, data.tone);
    },
  );

export const listReplyDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ reviewId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }): Promise<ReplyDraft[]> => {
    const { data: drafts, error } = await context.supabase
      .from("auto_replies")
      .select("id,reply_text,status,tone,model,created_at")
      .eq("review_id", data.reviewId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return drafts;
  });

export const listAllReplyDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReplyDraftListItem[]> => {
    const { data: drafts, error } = await context.supabase
      .from("auto_replies")
      .select("id,review_id,scan_id,reply_text,status,tone,model,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    if (!drafts.length) return [];

    const reviewIds = [...new Set(drafts.map((draft) => draft.review_id))];
    const scanIds = [...new Set(drafts.map((draft) => draft.scan_id))];
    const [reviewsResult, scansResult] = await Promise.all([
      context.supabase
        .from("reviews")
        .select("id,author,rating,text,review_url")
        .in("id", reviewIds),
      context.supabase.from("scans").select("id,business_name").in("id", scanIds),
    ]);
    if (reviewsResult.error) throw reviewsResult.error;
    if (scansResult.error) throw scansResult.error;

    const reviews = new Map(reviewsResult.data.map((review) => [review.id, review]));
    const businesses = new Map(scansResult.data.map((scan) => [scan.id, scan.business_name]));
    return drafts.map((draft) => {
      const review = reviews.get(draft.review_id);
      if (!review)
        throw new Error(`Review ${draft.review_id} is missing for reply draft ${draft.id}.`);
      return {
        id: draft.id,
        reply_text: draft.reply_text,
        status: draft.status,
        tone: draft.tone,
        model: draft.model,
        created_at: draft.created_at,
        review: {
          author: review.author,
          rating: review.rating,
          text: review.text,
          review_url: review.review_url,
        },
        businessName: businesses.get(draft.scan_id) ?? "Business",
      };
    });
  });

export const saveReplyDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({ draftId: z.string().uuid(), replyText: z.string().trim().min(1).max(4000) })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { data: draft, error } = await context.supabase
      .from("auto_replies")
      .update({ reply_text: data.replyText, updated_at: new Date().toISOString() })
      .eq("id", data.draftId)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!draft) throw new Error("This reply is no longer an editable draft.");
    return { ok: true };
  });

export const setReplyDraftStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        draftId: z.string().uuid(),
        replyText: z.string().trim().min(1).max(4000),
        status: z.enum(["approved", "rejected"]),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { data: draft, error } = await context.supabase
      .from("auto_replies")
      .update({
        reply_text: data.replyText,
        status: data.status,
        decision_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.draftId)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!draft) throw new Error("This reply has already been reviewed.");
    return { ok: true };
  });

export const getReplyAutomationSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const preference = await context.supabase
      .from("auto_reply_preferences")
      .select("enabled,tone")
      .eq("user_id", context.userId)
      .maybeSingle()
      .throwOnError();
    const draftCount = await context.supabase
      .from("auto_replies")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("status", "draft")
      .throwOnError();
    return {
      enabled: preference.data?.enabled ?? false,
      tone: preference.data?.tone ?? "professional",
      draftsReady: draftCount.count ?? 0,
    };
  });

export const setReplyAutomationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ enabled: z.boolean(), tone: z.enum(REPLY_TONES) }).parse(input))
  .handler(async ({ context, data }) => {
    const result = await context.supabase
      .from("auto_reply_preferences")
      .upsert(
        {
          user_id: context.userId,
          enabled: data.enabled,
          tone: data.tone,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("enabled")
      .single()
      .throwOnError();
    return result.data;
  });
