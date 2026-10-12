import { describe, expect, it, vi } from "vitest";
import { analyzeReview } from "./ai-orchestrator.server";

vi.mock("./ai-layer-usage.server", () => ({
  recordAiLayerUsage: vi.fn(async () => undefined),
}));

describe("ai orchestrator", () => {
  it("returns rules result immediately when confidence exceeds threshold", async () => {
    const rules = vi.fn(() => ({
      violates: true,
      policy: "fake_review",
      confidence: 82,
      evidence: "Short review",
      source: "rules" as const,
    }));
    const ollama = { isAvailable: vi.fn(() => true), analyze: vi.fn() };
    const gpt = { analyze: vi.fn() };

    const result = await analyzeReview({ text: "Bad service." }, { rules, ollama, gpt });
    expect(result.source).toBe("rules");
    expect(result.policy).toBe("fake_review");
    expect(ollama.analyze).not.toHaveBeenCalled();
    expect(gpt.analyze).not.toHaveBeenCalled();
  });

  it("falls back to Ollama when rules confidence is below threshold", async () => {
    const rules = vi.fn(() => ({
      violates: false,
      policy: "none",
      confidence: 30,
      evidence: "No rule match",
      source: "rules" as const,
    }));
    const ollama = {
      isAvailable: vi.fn(() => true),
      analyze: vi.fn(async () => ({
        violates: true,
        policy: "spam",
        confidence: 68,
        evidence: "Promotional link",
        source: "ollama" as const,
      })),
    };
    const gpt = { analyze: vi.fn() };

    const result = await analyzeReview(
      { text: "This is a store and visit now discount website." },
      { rules, ollama, gpt },
    );
    expect(result.source).toBe("ollama");
    expect(ollama.analyze).toHaveBeenCalledTimes(1);
    expect(gpt.analyze).not.toHaveBeenCalled();
  });

  it("falls back to GPT when Ollama is unavailable or below threshold", async () => {
    const rules = vi.fn(() => ({
      violates: false,
      policy: "none",
      confidence: 20,
      evidence: "No rule match",
      source: "rules" as const,
    }));
    const ollama = {
      isAvailable: vi.fn(() => false),
      analyze: vi.fn(),
    };
    const gpt = {
      analyze: vi.fn(async () => ({
        violates: true,
        policy: "prohibited_content",
        confidence: 74,
        evidence: "Threatening language",
        source: "gpt" as const,
      })),
    };

    const result = await analyzeReview(
      { text: "I will hurt you if you do not fix this." },
      { rules, ollama, gpt },
    );
    expect(result.source).toBe("gpt");
    expect(gpt.analyze).toHaveBeenCalledTimes(1);
  });

  it("accepts a confidence threshold only when it is high enough", async () => {
    const rules = vi.fn(() => ({
      violates: true,
      policy: "spam",
      confidence: 69,
      evidence: "Offer language",
      source: "rules" as const,
    }));
    const ollama = {
      isAvailable: vi.fn(() => true),
      analyze: vi.fn(async () => ({
        violates: true,
        policy: "spam",
        confidence: 90,
        evidence: "Strong suspicious link",
        source: "ollama" as const,
      })),
    };
    const gpt = { analyze: vi.fn() };

    const result = await analyzeReview(
      { text: "Call today for a limited discount." },
      { rules, ollama, gpt },
    );
    expect(result.confidence).toBeGreaterThanOrEqual(68);
    expect(result.source).toBe("ollama");
  });

  it("uses the rules layer at the inclusive 70 confidence threshold", async () => {
    const rules = vi.fn(() => ({
      violates: true,
      policy: "spam",
      confidence: 70,
      evidence: "Contains a promotional link.",
      source: "rules" as const,
    }));
    const ollama = { isAvailable: vi.fn(() => true), analyze: vi.fn() };
    const gpt = { analyze: vi.fn() };

    const result = await analyzeReview(
      { text: "A long review with a promotional link." },
      {
        rules,
        ollama,
        gpt,
        track: vi.fn(async () => undefined),
      },
    );

    expect(result.source).toBe("rules");
    expect(ollama.isAvailable).not.toHaveBeenCalled();
    expect(gpt.analyze).not.toHaveBeenCalled();
  });

  it("falls through to GPT when Ollama throws", async () => {
    const rules = vi.fn(() => ({
      violates: false,
      policy: "none",
      confidence: 0,
      evidence: "No rule match",
      source: "rules" as const,
    }));
    const ollama = {
      isAvailable: vi.fn(() => true),
      analyze: vi.fn(async () => {
        throw new Error("Ollama timeout");
      }),
    };
    const gpt = {
      analyze: vi.fn(async () => ({
        violates: false,
        policy: "none",
        confidence: 80,
        evidence: "",
        source: "gpt" as const,
      })),
    };
    const track = vi.fn(async () => undefined);

    const result = await analyzeReview(
      { text: "A detailed account of a normal visit." },
      {
        rules,
        ollama,
        gpt,
        track,
      },
    );

    expect(result.source).toBe("gpt");
    expect(gpt.analyze).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith("gpt", expect.objectContaining({ costUsd: 0.01 }));
  });

  it("surfaces GPT failure when no model layer can complete the analysis", async () => {
    const gpt = {
      analyze: vi.fn(async () => {
        throw new Error("GPT billing unavailable");
      }),
    };

    await expect(
      analyzeReview(
        { text: "A detailed account of a normal visit." },
        {
          rules: () => ({
            violates: false,
            policy: "none",
            confidence: 0,
            evidence: "No rule match",
          }),
          ollama: { isAvailable: () => false, analyze: vi.fn() },
          gpt,
          track: vi.fn(async () => undefined),
        },
      ),
    ).rejects.toThrow("GPT billing unavailable");
  });
});
