import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyzeReviews,
  classifyLayerRisk,
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
  it.each([
    [{ source: "rules", violates: true, confidence: 70 }, "high"],
    [{ source: "rules", violates: true, confidence: 69 }, "requires_review"],
    [{ source: "ollama", violates: true, confidence: 60 }, "medium"],
    [{ source: "ollama", violates: true, confidence: 59 }, "requires_review"],
    [{ source: "gpt", violates: true, confidence: 70 }, "high"],
    [{ source: "gpt", violates: true, confidence: 40 }, "medium"],
    [{ source: "gpt", violates: true, confidence: 39 }, "requires_review"],
    [{ source: "gpt", violates: false, confidence: 59 }, "requires_review"],
    [{ source: "gpt", violates: false, confidence: 60 }, "normal"],
  ] as const)("applies the layer-specific evidence threshold to %o", (result, expected) => {
    expect(classifyLayerRisk(result)).toBe(expected);
  });

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

  it("downgrades a high-risk assessment that has no evidence or signal", () => {
    const analysis: ReviewAnalysis = {
      risk: "high",
      category: "Spam",
      signals: ["", "  "],
      reason: "Unit fixture",
      evidence: null,
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
