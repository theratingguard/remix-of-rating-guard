import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeWithThreeModels, consensusReviews, validateBallots } from "./multi-model.server";
import type { PlaceReview } from "./google-places.server";
const reviews: PlaceReview[] = [
  {
    author: "Fixture",
    authorUri: null,
    rating: 1,
    publishedAt: null,
    relativeTime: null,
    text: "Buy our discount packages at spam.example",
    reviewUri: null,
  },
];
const yes = {
  index: 0,
  violates_policy: true,
  policy_type: "Spam",
  policy_section: "Advertising & solicitation",
  evidence_quote: "Buy our discount packages",
  reasoning: "Explicit advertising",
  confidence: 70,
};
const no = {
  ...yes,
  violates_policy: false,
  policy_type: "",
  policy_section: "",
  evidence_quote: "",
};
describe("Evidence-grounded three-model consensus", () => {
  it("accepts finite fractional confidence on the documented 0-100 scale", () => {
    expect(
      validateBallots({ results: [{ ...yes, confidence: 85.5 }] }, reviews)[0]?.confidence,
    ).toBe(85.5);
    expect(() => validateBallots({ results: [{ ...yes, confidence: 101 }] }, reviews)).toThrow();
  });
  it("accepts a complete three-provider response and preserves the ballots", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "fixture");
    vi.stubEnv("GEMINI_API_KEY", "fixture");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            choices: [{ message: { content: JSON.stringify({ results: [yes] }) } }],
          }),
        )
        .mockResolvedValueOnce(
          Response.json({ content: [{ type: "text", text: JSON.stringify({ results: [yes] }) }] }),
        )
        .mockResolvedValueOnce(
          Response.json({
            candidates: [{ content: { parts: [{ text: JSON.stringify({ results: [no] }) }] } }],
          }),
        ),
    );
    const result = await analyzeWithThreeModels("fixture", "Fixture", null, reviews);
    expect(result[0]?.risk).toBe("medium");
    expect(result[0]?.consensus.votes.map((vote) => vote.violates_policy)).toEqual([
      true,
      true,
      false,
    ]);
    expect(
      result[0]?.consensus.votes.every(
        (vote) => typeof vote.response_ms === "number" && vote.response_ms >= 0,
      ),
    ).toBe(true);
    expect(result[0]?.evidence).toBe(yes.evidence_quote);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("flags only when at least two validated models vote yes", () => {
    expect(consensusReviews([[yes], [yes], [no]], reviews)[0]).toMatchObject({
      risk: "medium",
      consensus: { agrees: true },
    });
    expect(consensusReviews([[yes], [no], [no]], reviews)[0]).toMatchObject({
      risk: "requires_review",
      evidence: null,
    });
    expect(consensusReviews([[no], [no], [no]], reviews)[0]?.risk).toBe("normal");
  });
  it("rejects invented evidence, policy headings and duplicate indices", () => {
    expect(() =>
      validateBallots({ results: [{ ...yes, evidence_quote: "fake" }] }, reviews),
    ).toThrow("invented evidence");
    expect(() =>
      validateBallots({ results: [{ ...yes, policy_section: "Section 99" }] }, reviews),
    ).toThrow("unverified policy");
    expect(() => validateBallots({ results: [yes, yes] }, reviews)).toThrow("duplicated");
  });
  it("does not make paid calls or silently fall back when keys are missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(analyzeWithThreeModels("fixture", "Fixture", null, reviews)).rejects.toMatchObject(
      { code: "AI_UNAVAILABLE" },
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses independent source-only calls and refuses incomplete consensus", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "fixture");
    vi.stubEnv("GEMINI_API_KEY", "fixture");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ choices: [{ message: { content: JSON.stringify({ results: [yes] }) } }] }),
      )
      .mockResolvedValueOnce(
        Response.json({ content: [{ type: "text", text: JSON.stringify({ results: [yes] }) }] }),
      )
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    await expect(analyzeWithThreeModels("fixture", "Fixture", null, reviews)).rejects.toMatchObject(
      { code: "AI_UNAVAILABLE" },
    );
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const [, init] of fetch.mock.calls) expect(init.body).not.toContain("firstAssessment");
  });
});
