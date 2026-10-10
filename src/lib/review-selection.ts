import { z } from "zod";
import type { AnalyzedReview } from "./data";
import type { Json } from "@/integrations/supabase/types";

export function selectedPdfUrl(metadata: Json | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const url = metadata["selected_pdf_url"];
  const saved = metadata["selected_saved_at"];
  if (
    typeof url !== "string" ||
    typeof saved !== "string" ||
    !Number.isFinite(Date.parse(saved)) ||
    Date.now() - Date.parse(saved) >= 90 * 86400000
  )
    return null;
  return /^https:\/\/ratingguard\.online\/reports\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_selected\.pdf$/.test(
    url,
  )
    ? url
    : null;
}

export const requestSchema = z.object({
  review_id: z.string().uuid(),
  assessment: z.enum(["supported_policy_concern", "insufficient_evidence"]),
  policy: z.string().min(1).max(200),
  evidence: z.string().max(3000),
  request_text: z.string().min(1).max(6000),
  policy_reference: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === "support.google.com";
    }),
});
export const selectionOutputSchema = z.object({ requests: z.array(requestSchema).min(1).max(5) });
export type SelectionRequest = z.infer<typeof requestSchema>;

export function reviewGoogleLink(
  review: Pick<AnalyzedReview, "review_uri" | "author">,
  businessName: string,
  mapsUri: string | null,
) {
  if (review.review_uri) return { url: review.review_uri, label: "View original review on Google" };
  if (mapsUri) return { url: mapsUri, label: "Find review on business Maps page" };
  return {
    url: `https://www.google.com/search?q=${encodeURIComponent(`${businessName} review ${review.author}`)}`,
    label: "Search for review on Google (not a direct review link)",
  };
}

export function validateSelectionOutput(value: unknown, reviews: AnalyzedReview[]) {
  const parsed = selectionOutputSchema.parse(value);
  const ids = new Set(parsed.requests.map((request) => request.review_id));
  if (
    ids.size !== reviews.length ||
    parsed.requests.length !== reviews.length ||
    reviews.some((review) => !ids.has(review.id))
  )
    throw new Error("AI did not return exactly one assessment for each selected review.");
  return parsed.requests.map((request) => {
    const review = reviews.find((review) => review.id === request.review_id);
    if (!review) throw new Error("Unexpected AI review ID.");
    const supported =
      request.assessment === "supported_policy_concern" &&
      (review.analysis?.risk === "high" || review.analysis?.risk === "medium") &&
      request.evidence.trim().length > 0 &&
      Boolean(review.text?.includes(request.evidence));
    if (supported) return request;
    return {
      ...request,
      assessment: "insufficient_evidence" as const,
      policy: "No substantiated policy violation",
      evidence: "",
      request_text:
        "Insufficient evidence for a removal request. Selection or a low rating is not proof of a Google policy violation. Manually assess the review and gather factual supporting documentation before reporting.",
    };
  });
}
