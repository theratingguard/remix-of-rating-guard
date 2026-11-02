import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generateSmartReply, getSmartReplyModel } from "./reply-rag.server";
import type { ReplyTone, ReplySuggestion } from "./reply-config";

export async function createReplyDraft(
  db: SupabaseClient<Database>,
  userId: string,
  reviewId: string,
  tone: ReplyTone,
  source: "manual" | "automatic" = "manual",
): Promise<{ ok: true; suggestion: ReplySuggestion } | { ok: false; message: string }> {
  const { data: review, error } = await db
    .from("reviews")
    .select(
      "id, scan_id, author, rating, text, review_analyses!review_analyses_review_id_fkey(risk, category, reason, evidence), scans!reviews_scan_id_fkey(business_name, category)",
    )
    .eq("id", reviewId)
    .maybeSingle();
  if (error) return { ok: false, message: "Database unavailable — could not load the review." };
  if (!review) return { ok: false, message: "Review not found." };
  const analysis = Array.isArray(review.review_analyses)
    ? review.review_analyses[0]
    : review.review_analyses;
  const model = getSmartReplyModel();

  let reply: string;
  try {
    reply = await generateSmartReply(
      review.text || "The customer left a star rating without written feedback.",
      review.rating,
      review.scans?.category || "general",
      db,
      { tone },
    );
  } catch (generationError) {
    console.error("[reply-rag] Draft generation failed.", generationError);
    return {
      ok: false,
      message:
        "Local reply AI is unavailable or the training examples are not ready. Check Ollama and reply-training setup.",
    };
  }

  const summary =
    analysis?.reason?.trim() ||
    `This review is rated ${review.rating}/5${analysis?.category ? ` and is categorized as ${analysis.category}` : ""}.`;
  const riskExplanation = analysis
    ? `${analysis.risk} review assessment${analysis.reason ? `: ${analysis.reason}` : "."}`
    : "This review has no separate policy-risk analysis.";
  const recommendedAction =
    review.rating <= 2
      ? "Review the concern and invite the reviewer to discuss details privately before responding."
      : "Review the suggested response for accuracy and personalize it before replying.";

  const { data: saved, error: saveError } = await db
    .from("auto_replies")
    .insert({
      review_id: review.id,
      scan_id: review.scan_id,
      user_id: userId,
      reply_text: reply,
      tone,
      model,
      source,
    })
    .select("id")
    .single();
  if (saveError) throw saveError;

  await db
    .from("audit_log")
    .insert({
      user_id: userId,
      action: source === "automatic" ? "review.reply_auto_drafted" : "review.reply_suggested",
      detail: { review_id: review.id, scan_id: review.scan_id, tone, model },
    })
    .throwOnError();
  return {
    ok: true,
    suggestion: {
      id: saved.id,
      summary,
      riskExplanation,
      recommendedAction,
      reply,
      tone,
      model,
    },
  };
}
