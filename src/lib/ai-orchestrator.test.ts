import { describe, expect, it, vi } from "vitest";
import { analyzeReview } from "./ai-orchestrator.server";

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
});
