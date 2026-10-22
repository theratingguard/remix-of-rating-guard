import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function hasClientRole(claims: Record<string, unknown>) {
  const metadata = claims["app_metadata"];
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    "role" in metadata &&
    metadata.role === "client"
  );
}

export const prepareClientReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ reviewId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    if (!hasClientRole(context.claims)) throw new Error("Access denied. Client account required.");

    const { data: review, error: reviewError } = await context.supabase
      .from("reviews")
      .select("id, scan_id, rating, risk, review_uri")
      .eq("id", data.reviewId)
      .single();
    if (reviewError || !review) throw new Error("This review is not available in your account.");
    if (![1, 2].includes(review.rating) || !["high", "medium"].includes(review.risk))
      throw new Error("Only flagged 1- or 2-star reviews can be prepared for reporting.");
    if (!review.review_uri)
      throw new Error("Google did not provide a direct link for this review.");

    const { data: action, error: actionError } = await context.supabase
      .from("review_actions")
      .update({
        status: "PENDING",
        note: "Client report draft prepared; Google submission has not been confirmed.",
        updated_at: new Date().toISOString(),
      })
      .eq("review_id", review.id)
      .eq("scan_id", review.scan_id)
      .eq("user_id", context.userId)
      .select("id")
      .maybeSingle();

    if (actionError) throw new Error("Could not save the report draft. Please try again.");
    if (!action) throw new Error("A verified report action is not available for this review.");
    return { ok: true as const, status: "PENDING" as const };
  });
