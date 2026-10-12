import { isGoogleMapsUrl } from "./google-url";

export type LegalChannel =
  "Fake Engagement" | "Conflict of Interest" | "Harassment/Defamation" | "Spam";

export type LegalChannelSelection = {
  channel: LegalChannel | null;
  google_form_url: null;
  review_url: string | null;
  submission_guide: string[];
  expected_time: string;
};

export function selectLegalChannel(
  policyType: string,
  reviewUrl: string | null,
): LegalChannelSelection {
  const normalized = policyType.trim().toLocaleLowerCase();
  const channel: LegalChannel | null = /fake|incentiv|paid|engagement/.test(normalized)
    ? "Fake Engagement"
    : /conflict|competitor|affiliation/.test(normalized)
      ? "Conflict of Interest"
      : /defam|harass|threat|abuse/.test(normalized)
        ? "Harassment/Defamation"
        : /spam|solicit|advertis|promot/.test(normalized)
          ? "Spam"
          : null;
  const verifiedReviewUrl =
    reviewUrl && isGoogleMapsUrl(reviewUrl) ? new URL(reviewUrl).toString() : null;

  return {
    channel,
    google_form_url: null,
    review_url: verifiedReviewUrl,
    submission_guide: [
      "Open the exact review in Google Maps and use any reporting option Google makes available.",
      "Select the closest matching policy category only when supported by the review and authentic evidence.",
      "Review the text and evidence yourself before submitting; Rating Guard does not submit or verify reports.",
    ],
    expected_time: "Not published by Google Places API; no response-time estimate is available.",
  };
}
