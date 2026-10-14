import { describe, it, expect, vi, afterEach } from "vitest";
import type { AnalyzedReview } from "./data";
import {
  LEGAL_POLICY_URL,
  LEGAL_GROUNDS,
  LEGAL_TEMPLATES,
  validateLegalReviews,
  savedLegalPdfUrl,
  unsupportedLegalReview,
} from "./legal-analysis";
import { generateLegalAnalysis } from "./analysis.server";
import { readOpenAIStream } from "./openai-stream.server";
vi.mock("./openai-stream.server", () => ({ readOpenAIStream: vi.fn() }));
vi.mock("./settings.server", async () => {
  const { defaultSettings } = await import("./settings");
  return { getSettings: async () => defaultSettings };
});
const review: AnalyzedReview = {
  id: "d8bdb357-60db-4a05-92c4-38020ec52eda",
  author: "Unit Reviewer",
  rating: 1,
  text: "Visit my website for discounts",
  review_uri: null,
  published_at: null,
  relative_time: null,
  analysis: {
    risk: "high",
    category: "promotion",
    signals: [],
    reason: "Unit concern",
    evidence: "Visit my website",
    confidence: 80,
    model: "unit",
  },
};
const request = {
  ...unsupportedLegalReview(review),
  violates_policy: true,
  policy_type: "Spam",
  policy_section: "Advertising & solicitation",
  evidence_quote: "Visit my website",
  removal_request_text: `Advertising & solicitation. Evidence: Visit my website ${Array.from({ length: 213 }, () => "assessment").join(" ")}`,
  removal_likelihood: 60,
  reasoning: "Quoted promotion may fit the supplied policy.",
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("Legal Expert evidence boundaries", () => {
  it("accepts exact evidence/allowlisted citation and enforces jurisdiction-limited legal grounds", () => {
    expect(
      validateLegalReviews(
        { reviews: [{ ...request, legal_grounds: "Fabricated court ruling" }] },
        [review],
      )[0],
    ).toMatchObject({ removal_likelihood: 60, legal_grounds: LEGAL_GROUNDS });
    expect(LEGAL_TEMPLATES).toHaveLength(4);
    for (const template of LEGAL_TEMPLATES) {
      expect(template.text).toContain(LEGAL_POLICY_URL);
      const words = template.text.trim().split(/\s+/).length;
      expect(words).toBeGreaterThanOrEqual(200);
      expect(words).toBeLessThanOrEqual(300);
    }
  });
  it.each([
    { ...request, removal_request_text: Array.from({ length: 220 }, () => "assessment").join(" ") },
    { ...request, evidence_quote: "invented quote" },
    { ...request, policy_section: "Google Legal Section 42" },
    { ...request, removal_request_text: "too short" },
    { ...request, removal_request_text: Array.from({ length: 301 }, () => "word").join(" ") },
    { ...request, removal_likelihood: 101 },
    { ...request, policy_url: "https://attacker.invalid/policy" },
  ])("rejects invalid evidence, citation, length, score or policy URL", (item) => {
    expect(() => validateLegalReviews({ reviews: [item] }, [review])).toThrow();
  });
  it("requires exact IDs and rejects a false allegation on an unresolved review", () => {
    expect(() => validateLegalReviews({ reviews: [request, request] }, [review])).toThrow();
    expect(() =>
      validateLegalReviews({ reviews: [request] }, [
        { ...review, analysis: { ...review.analysis!, risk: "requires_review" } },
      ]),
    ).toThrow();
  });
  it("does not call AI or fabricate a likelihood/removal request when nothing is flagged", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const output = await generateLegalAnalysis("Unit Business", [
      { ...review, analysis: { ...review.analysis!, risk: "requires_review" } },
    ]);
    expect(fetch).not.toHaveBeenCalled();
    expect(output.reviews[0]).toMatchObject({
      violates_policy: false,
      removal_likelihood: 0,
      removal_request_text: "",
    });
  });
  it("calls AI for a flagged review and preserves the 220-word formal draft", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({})),
    );
    vi.mocked(readOpenAIStream).mockResolvedValue(JSON.stringify({ reviews: [request] }));
    const output = await generateLegalAnalysis("Unit Business", [review]);
    expect(output.reviews[0]?.removal_request_text.split(/\s+/)).toHaveLength(220);
    expect(output.reviews[0]?.legal_grounds).toBe(LEGAL_GROUNDS);
    expect(output.disclaimer).toContain("not legal advice");
  });
  it("repairs an invalid word count once using measured validation feedback", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-secret");
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({}));
    vi.stubGlobal("fetch", fetch);
    vi.mocked(readOpenAIStream)
      .mockResolvedValueOnce(
        JSON.stringify({
          reviews: [
            {
              ...request,
              removal_request_text: "Advertising & solicitation. Evidence: Visit my website",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(JSON.stringify({ reviews: [request] }));
    const output = await generateLegalAnalysis("Unit Business", [review]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)).input[0].content).toContain(
      "received 7 whitespace-separated words",
    );
    expect(output.reviews[0]?.removal_request_text.split(/\s+/)).toHaveLength(220);
  });
  it("fails explicitly on provider errors and invented AI evidence", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 429 })),
    );
    await expect(generateLegalAnalysis("Unit Business", [review])).rejects.toThrow("[429]");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({})),
    );
    vi.mocked(readOpenAIStream).mockResolvedValue(
      JSON.stringify({ reviews: [{ ...request, evidence_quote: "invented" }] }),
    );
    await expect(generateLegalAnalysis("Unit Business", [review])).rejects.toThrow(
      "invalid citations",
    );
  });
  it("rejects untrusted or expired legal download URLs", () => {
    const metadata = {
      legal_pdf_url: `https://ratingguard.online/api/storage/download?folder=reports%2F00000000-0000-4000-8000-000000000003&filename=${review.id}_legal.pdf`,
      legal_pdf_saved_at: new Date().toISOString(),
    };
    expect(savedLegalPdfUrl(metadata)).toBe(metadata.legal_pdf_url);
    expect(savedLegalPdfUrl({ ...metadata, legal_pdf_url: "javascript:alert(1)" })).toBeNull();
    expect(
      savedLegalPdfUrl({
        ...metadata,
        legal_pdf_saved_at: new Date(Date.now() - 90 * 86400000).toISOString(),
      }),
    ).toBeNull();
  });
});
