import type { AnalyzedReview, Scan } from "./data";
import { getLegalWorker } from "./legal-workers.server";
import { regionForAddress, regionForCountryCode } from "./regional-routing";
import { getCountryTemplates } from "./legal-templates/country-templates";

export async function detectCountry(
  scan: Pick<Scan, "region" | "address"> & { country_code?: string | null },
) {
  if (scan.region && !["EU", "AF", "OTHER"].includes(scan.region)) return scan.region;
  const addressRegion = regionForAddress(scan.address);
  if (addressRegion !== "OTHER") return addressRegion;
  if (scan.country_code) return regionForCountryCode(scan.country_code);
  return scan.region ?? regionForCountryCode(null);
}

export async function generateLegalRequest(
  scan: Pick<Scan, "region" | "address" | "business_name"> & { country_code?: string | null },
  review: Pick<AnalyzedReview, "author" | "review_uri" | "text"> & {
    analysis: Pick<NonNullable<AnalyzedReview["analysis"]>, "category" | "evidence"> | null;
  },
  template: "primary" | "followUp" | "escalation" = "primary",
  options: { workerEnabled?: boolean } = {},
) {
  const country = await detectCountry(scan);
  const worker = getLegalWorker(country);
  const evidenceQuote =
    review.analysis?.evidence && review.text?.includes(review.analysis.evidence)
      ? review.analysis.evidence
      : "";
  const input = {
    businessName: scan.business_name || "the business",
    reviewUrl: review.review_uri,
    reviewerName: review.author || "Google reviewer",
    reviewText: review.text ?? "",
    policy: review.analysis?.category || "the relevant Google Maps content policy",
    evidenceQuote,
  };

  if (worker && options.workerEnabled !== false) return worker.generateRequest(input, template);

  const fallback = getCountryTemplates()
    [template].replaceAll("{{businessName}}", input.businessName)
    .replaceAll("{{reviewUrl}}", input.reviewUrl ?? "[add the original review URL]")
    .replaceAll("{{reviewerName}}", input.reviewerName)
    .replaceAll("{{policy}}", input.policy)
    .replaceAll("{{evidenceQuote}}", input.evidenceQuote);
  return {
    country: null,
    template,
    method: "google-policy-review" as const,
    text: fallback,
    policyUrl: "https://support.google.com/contributionpolicy/answer/7400114",
    laws: [],
    legalNote:
      "No country-specific legal worker is configured. This is a platform-policy draft only, not legal advice.",
  };
}
