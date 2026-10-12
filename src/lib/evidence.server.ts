import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { isGoogleMapsUrl } from "./google-url";
import { detectReviewLanguage, languageEvidence } from "./review-language";

export type ReviewEvidenceInput = {
  reviewId: string;
  text: string | null;
  reviewUrl: string | null;
  author: string | null;
  authorUri: string | null;
  rating: number;
};

function verifiedMapsUrl(raw: string | null) {
  if (!raw || !isGoogleMapsUrl(raw)) return null;
  const url = new URL(raw);
  return /(^|\.)google\.[a-z.]+$/u.test(url.hostname) && /^\/maps(?:\/|$)/u.test(url.pathname)
    ? url.toString()
    : null;
}

export async function collectReviewEvidence(
  db: SupabaseClient<Database>,
  input: ReviewEvidenceInput,
) {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)
    throw new Error("Evidence requires the original Google Places rating.");

  const reviewUrl = verifiedMapsUrl(input.reviewUrl);
  const profileUrl = verifiedMapsUrl(input.authorUri);
  const text = input.text ?? "";
  const contentHash = createHash("sha256")
    .update(JSON.stringify([text, input.rating, input.author]))
    .digest("hex");
  const capturedAt = new Date().toISOString();
  const language = detectReviewLanguage(text);
  const markers = languageEvidence(text);
  const metadata: Json = {
    source: "google_places",
    screenshot: {
      status: "unavailable",
      reason: "Places API does not provide a screenshot; no Google Maps page was scraped.",
    },
    review_url_status: reviewUrl ? "validated_google_maps_url" : "unavailable_or_invalid",
    reviewer_profile: {
      status: profileUrl ? "attribution_url_available_only" : "not_provided_by_places_api",
      attribution_url: profileUrl,
      profile_contents_checked: false,
    },
    cross_platform_check: {
      status: "not_performed",
      reason: "Cross-platform collection is outside the Google Maps/Places-only scope.",
    },
    language,
    language_evidence: markers,
    rating: input.rating,
    author: input.author,
    review_text_sha256: createHash("sha256").update(text).digest("hex"),
  };

  const result = await db
    .from("review_evidence")
    .upsert(
      {
        review_id: input.reviewId,
        content_hash: contentHash,
        screenshot_url: null,
        review_url: reviewUrl,
        captured_at: capturedAt,
        metadata,
      },
      { onConflict: "review_id,content_hash" },
    )
    .select("id,review_id,content_hash,screenshot_url,review_url,captured_at,metadata")
    .single();
  if (result.error) throw new Error(`Could not save review evidence [${result.error.code}].`);
  return result.data;
}
