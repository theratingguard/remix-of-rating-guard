import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyzeReviews,
  enforceEvidence,
  reviewHash,
  type ReviewAnalysis,
} from "./analysis.server";
import type { PlaceReview } from "./google-places.server";
vi.mock("./settings.server", async () => {
  const { defaultSettings } = await import("./settings");
  return { getSettings: async () => ({ ...defaultSettings, multi_model_enabled: false }) };
});

const review: PlaceReview = {
  author: "Unit fixture",
  authorUri: null,
  rating: 1,
  publishedAt: null,
  relativeTime: null,
  text: "A unit test fixture.",
  reviewUri: null,
};
describe("Analysis integrity (unit fixtures, not real AI results)", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("rejects missing AI results instead of generating a completed analysis", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [{ message: { content: '{"results":[]}' } }],
        }),
      ),
    );
    await expect(analyzeReviews("test-key", "Fixture", null, [review])).rejects.toMatchObject({
      code: "AI_INVALID_RESPONSE",
    });
  });

  it("rejects duplicate result indices", async () => {
    const result = {
      index: 0,
      risk: "normal",
      signals: [],
      reason: "Fixture only",
      confidence: 50,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [
            {
              message: { content: JSON.stringify({ results: [result, result] }) },
            },
          ],
        }),
      ),
    );
    await expect(
      analyzeReviews("test-key", "Fixture", null, [review, review]),
    ).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
  });

  it("downgrades fabricated evidence that is absent from the source review", () => {
    const analysis: ReviewAnalysis = {
      risk: "high",
      category: null,
      signals: ["fixture"],
      reason: "Unit fixture",
      evidence: "Absent quote",
      confidence: 90,
    };
    expect(enforceEvidence(analysis, review.text)).toMatchObject({
      risk: "requires_review",
      evidence: null,
    });
  });

  it("does not share cached conclusions across different business contexts", async () => {
    expect(await reviewHash(review.text, review.rating, "business-a")).not.toBe(
      await reviewHash(review.text, review.rating, "business-b"),
    );
  });
});
