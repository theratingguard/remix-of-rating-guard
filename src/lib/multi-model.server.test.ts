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
  it("uses both enabled votes for two models and labels a single opinion honestly", () => {
    const two = consensusReviews([[yes], [no]], reviews, [20, 0, 40], [0, 2])[0]!;
    expect(two.consensus.agrees).toBe(false);
    expect(two.confidence).toBe(70);
    expect(two.consensus.votes.map((v) => v.response_ms)).toEqual([20, 40]);
    expect(consensusReviews([[yes], [yes]], reviews, [], [0, 2])[0]?.consensus.agrees).toBe(true);
    const one = consensusReviews([[yes]], reviews, [], [1])[0]!;
    expect(one.reason).toContain("Single-model");
    expect(one.confidence).toBe(70);
    expect(one.consensus.votes).toHaveLength(1);
  });
  it("never calls disabled Claude and requires only the enabled credentials", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "fixture");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ choices: [{ message: { content: JSON.stringify({ results: [yes] }) } }] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ results: [yes] }) }] } }],
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await analyzeWithThreeModels("fixture", "Fixture", null, reviews, [0, 2]);
    expect(result[0]?.consensus.enabled_models).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.every(([url]) => !String(url).includes("anthropic"))).toBe(true);
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.properties.results.minItems).toBe(
      reviews.length,
    );
    expect(body.response_format.json_schema.schema.properties.results.maxItems).toBe(
      reviews.length,
    );
    expect(
      body.response_format.json_schema.schema.properties.results.items.properties.index.enum,
    ).toEqual([0]);
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
    expect(fetch).toHaveBeenCalledTimes(5);
    for (const [, init] of fetch.mock.calls) expect(init.body).not.toContain("firstAssessment");
  });
  it("retries malformed GPT output and succeeds on the third attempt with no duplicate ballots", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ choices: [{ message: { content: '{"results":[]}' } }] }),
      )
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: "invalid" } }] }))
      .mockResolvedValueOnce(
        Response.json({ choices: [{ message: { content: JSON.stringify({ results: [yes] }) } }] }),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await analyzeWithThreeModels("fixture", "Fixture", null, reviews, [0]);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result[0]?.risk).toBe("medium");
    expect(result[0]?.consensus.votes).toHaveLength(1);
  });
  it("labels same-provider GPT fallback after 3 transient failures, without calling disabled providers", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({ choices: [{ message: { content: JSON.stringify({ results: [yes] }) } }] }),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await analyzeWithThreeModels("fixture", "Fixture", null, reviews, [0]);
    expect(result[0]?.consensus.model).toBe("gpt-4.1-mini");
    expect(result[0]?.consensus.fallback).toContain("exhausted");
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls.every(([url]) => String(url).includes("openai"))).toBe(true);
  });
  it("does not retry or fall back on provider authentication or exhausted quota", async () => {
    for (const status of [401, 402, 429]) {
      const fetch = vi.fn().mockResolvedValue(new Response("insufficient_quota", { status }));
      vi.stubGlobal("fetch", fetch);
      await expect(
        analyzeWithThreeModels("fixture", "Fixture", null, reviews, [0]),
      ).rejects.toMatchObject({ code: status === 401 ? "AI_AUTH" : "AI_QUOTA" });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });
});
