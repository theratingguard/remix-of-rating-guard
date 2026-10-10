import { z } from "zod";
import type { AnalyzedReview } from "./data";
import type { Json } from "@/integrations/supabase/types";

export const LEGAL_VERSION = "legal-v1";
export const LEGAL_POLICY_URL = "https://support.google.com/contributionpolicy/answer/7400114";
export const LEGAL_DISCLAIMER =
  "AI-assisted policy assessment, not legal advice or a lawyer's opinion. Google decides removal. Likelihood scores are uncalibrated AI estimates, not verified probabilities. Defamation, false light, consumer protection and platform liability depend on jurisdiction and verified facts; consult qualified counsel.";
export const LEGAL_POLICIES = {
  fake_content: {
    type: "Fake Content",
    section: "Fake Engagement",
    description:
      "Assess whether documented facts show content does not reflect a genuine experience. A lack of matching customer records alone is not proof.",
  },
  conflict_of_interest: {
    type: "Conflict of Interest",
    section: "Rating Manipulation",
    description:
      "Assess documented employment, contractual or other affiliations and how they create bias; do not infer affiliation from tone or rating.",
  },
  spam: {
    type: "Spam",
    section: "Advertising & solicitation",
    description:
      "Assess promotional or commercial material in the review, using its exact quoted wording. Similar criticism alone is not spam.",
  },
  prohibited_content: {
    type: "Prohibited Content",
    section: "Harassment",
    description:
      "Assess content targeting people or businesses with prohibited harassment; ordinary criticism or an account of a negative experience is not enough.",
  },
} as const;

export const LEGAL_CITATIONS = [
  ...Object.values(LEGAL_POLICIES),
  {
    type: "Prohibited Content",
    section: "Hate speech",
    description:
      "Assess explicit targeting of protected characteristics; never infer protected status or intent from a low rating.",
  },
  {
    type: "Prohibited Content",
    section: "Offensive content",
    description:
      "Assess deliberately attacking or provocative content in context; a disputed account of customer experience is not itself evidence that an allegation is unsubstantiated.",
  },
];

export const LEGAL_TEMPLATES = Object.entries(LEGAL_POLICIES).map(([key, policy]) => ({
  key,
  name: `${policy.type} template`,
  text: `To the Google Maps review moderation team:

I request a policy assessment of [review URL] concerning [business name]. The relevant policy heading is "${policy.section}" in Google's prohibited and restricted content policy (${LEGAL_POLICY_URL}).

The exact review wording is: "[paste verbatim excerpt]". [Describe precisely how the excerpt and verified documents relate to this policy; do not state unverified allegations.] ${policy.description}

Supporting documents: [list authentic documents you can lawfully share; redact unnecessary personal information]. Distinguish established facts from disputed statements and opinion. Do not claim a court finding or legal violation without applicable jurisdiction and verified legal support.

Please independently evaluate this evidence against the cited policy and remove the content only if it meets Google's removal criteria. This request does not seek to suppress legitimate negative feedback and does not guarantee removal.

Respectfully,
[authorized business representative]`,
}));

const legalItemSchema = z.object({
  review_id: z.string().uuid(),
  violates_policy: z.boolean(),
  policy_type: z.string().max(200),
  policy_section: z.string().max(200),
  policy_url: z.literal(LEGAL_POLICY_URL),
  evidence_quote: z.string().max(10000),
  legal_grounds: z.string().min(1).max(2000),
  removal_request_text: z.string().max(10000),
  supporting_docs: z.array(z.string().min(1).max(500)).max(8),
  removal_likelihood: z.number().int().min(0).max(100),
  reasoning: z.string().min(1).max(4000),
});
export const legalAnalysisSchema = z.object({
  version: z.literal(LEGAL_VERSION),
  generated_at: z.string().datetime(),
  model: z.string().min(1),
  disclaimer: z.literal(LEGAL_DISCLAIMER),
  reviews: z.array(legalItemSchema).max(5),
});
export type LegalAnalysis = z.infer<typeof legalAnalysisSchema>;
export type LegalReview = LegalAnalysis["reviews"][number];
export const LEGAL_GROUNDS =
  "No legal violation established. Defamation generally requires a provably false factual assertion and other jurisdiction-specific elements; opinion and negative experience are not automatically defamation. False light, consumer protection and platform liability cannot be applied without jurisdiction and verified facts. Seek qualified legal counsel; this is a Google policy assessment only.";

export function unsupportedLegalReview(
  review: AnalyzedReview,
  reasoning = "No supported flagged policy concern. Negative feedback or user selection alone is not evidence of a violation.",
): LegalReview {
  return {
    review_id: review.id,
    violates_policy: false,
    policy_type: "No substantiated violation",
    policy_section: "Not established",
    policy_url: LEGAL_POLICY_URL,
    evidence_quote: "",
    legal_grounds: LEGAL_GROUNDS,
    removal_request_text: "",
    supporting_docs: [],
    removal_likelihood: 0,
    reasoning,
  };
}

export function validateLegalReviews(value: unknown, reviews: AnalyzedReview[]) {
  const parsed = z.object({ reviews: z.array(legalItemSchema).max(5) }).parse(value).reviews;
  if (
    parsed.length !== reviews.length ||
    new Set(parsed.map((item) => item.review_id)).size !== reviews.length ||
    reviews.some((review) => !parsed.some((item) => item.review_id === review.id))
  )
    throw new Error("Legal analysis must include exactly the requested review IDs.");
  return reviews.map((review) => {
    const item = parsed.find((item) => item.review_id === review.id)!;
    if (!item.violates_policy) return unsupportedLegalReview(review, item.reasoning);
    if (
      (review.analysis?.risk !== "high" && review.analysis?.risk !== "medium") ||
      !item.evidence_quote.trim() ||
      !review.text?.includes(item.evidence_quote)
    )
      throw new Error("Legal analysis returned unsupported or invented evidence.");
    const policy = LEGAL_CITATIONS.find(
      (policy) => policy.type === item.policy_type && policy.section === item.policy_section,
    );
    if (!policy) throw new Error("Legal analysis cited an unverified Google policy section.");
    const words = item.removal_request_text.trim().split(/\s+/).length;
    if (words < 200 || words > 300)
      throw new Error(
        `Legal removal request must contain 200-300 words; received ${words} whitespace-separated words. Revise the request to 240-260 words without inventing facts.`,
      );
    return { ...item, legal_grounds: LEGAL_GROUNDS };
  });
}

export function savedLegalAnalysis(metadata: Json | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const parsed = legalAnalysisSchema.safeParse(metadata["legal_analysis"]);
  return parsed.success ? parsed.data : null;
}

export function savedLegalPdfUrl(metadata: Json | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const url = metadata["legal_pdf_url"];
  const saved = metadata["legal_pdf_saved_at"];
  if (
    typeof url !== "string" ||
    typeof saved !== "string" ||
    !Number.isFinite(Date.parse(saved)) ||
    Date.now() - Date.parse(saved) >= 90 * 86400000
  )
    return null;
  return /^https:\/\/ratingguard\.online\/reports\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_legal\.pdf$/.test(
    url,
  )
    ? url
    : null;
}
