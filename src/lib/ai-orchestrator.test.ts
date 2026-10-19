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

  it("uses OLLAMA_URL for the local model service", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/api/tags")) return Response.json({ models: [] });
      return Response.json({
        response: JSON.stringify({
          violates: false,
          policy: "none",
          confidence: 80,
          evidence: "",
        }),
      });
    });
    vi.stubEnv("OLLAMA_URL", "http://ollama-test:11434/");
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await analyzeReview(
        { text: "A detailed account of a normal visit." },
        {
          rules: () => ({
            violates: false,
            policy: "none",
            confidence: 0,
            evidence: "No rule match",
          }),
          track: vi.fn(async () => undefined),
        },
      );

      expect(result.source).toBe("ollama");
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        "http://ollama-test:11434/api/tags",
        expect.any(Object),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "http://ollama-test:11434/api/generate",
        expect.objectContaining({
          body: expect.stringContaining(
            '"model":"llama3.2:3b","stream":false,"format":"json","keep_alive":"24h","options":{"num_ctx":2048,"num_predict":128,"temperature":0}',
          ),
        }),
      );
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("tries the configured fallback model when the primary model fails", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/api/tags")) return Response.json({ models: [] });
      const request = JSON.parse(String(init?.body)) as { model: string };
      if (request.model === "llama3.2:3b") return new Response(null, { status: 500 });
      return Response.json({
        response: JSON.stringify({
          violates: false,
          policy: "none",
          confidence: 80,
          evidence: "",
        }),
      });
    });
    vi.stubEnv("OLLAMA_URL", "http://ollama-test:11434");
    vi.stubEnv("OLLAMA_TIMEOUT_MS", "60000");
    vi.stubEnv("OLLAMA_MODEL", "llama3.2:3b");
    vi.stubEnv("OLLAMA_FALLBACK_MODEL", "llama3.1:8b");
    vi.stubGlobal("fetch", fetchMock);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

    try {
      const result = await analyzeReview(
        { text: "A detailed account of a normal visit." },
        {
          rules: () => ({
            violates: false,
            policy: "none",
            confidence: 0,
            evidence: "No rule match",
          }),
          track: vi.fn(async () => undefined),
        },
      );

      expect(result.source).toBe("ollama");
      expect(
        fetchMock.mock.calls
          .filter(([, init]) => !!init?.body)
          .map(([, init]) => JSON.parse(String(init?.body)).model),
      ).toEqual(["llama3.2:3b", "llama3.1:8b"]);
      const ollamaTimeouts = timeoutSpy.mock.calls.map(([timeout]) => timeout);
      expect(ollamaTimeouts[0]).toBe(15_000);
      expect(ollamaTimeouts[1]).toBeLessThanOrEqual(15_000);
    } finally {
      timeoutSpy.mockRestore();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("caps the total Ollama budget at 15 seconds and falls back to GPT on timeout", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/api/tags")) return Response.json({ models: [] });
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    const gpt = {
      analyze: vi.fn(async () => ({
        violates: false,
        policy: "none",
        confidence: 75,
        evidence: "",
        source: "gpt" as const,
      })),
    };
    vi.stubEnv("OLLAMA_URL", "http://ollama-test:11434");
    vi.stubEnv("OLLAMA_TIMEOUT_MS", "60000");
    vi.stubGlobal("fetch", fetchMock);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

    try {
      const result = await analyzeReview(
        { text: "A detailed account of a normal visit." },
        {
          rules: () => ({
            violates: false,
            policy: "none",
            confidence: 0,
            evidence: "No rule match",
          }),
          gpt,
          track: vi.fn(async () => undefined),
        },
      );

      expect(result.source).toBe("gpt");
      const modelTimeouts = timeoutSpy.mock.calls
        .map(([timeout]) => timeout)
        .filter((timeout) => timeout > 1_000);
      expect(modelTimeouts[0]).toBe(15_000);
      expect(modelTimeouts[1]).toBeLessThanOrEqual(15_000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(gpt.analyze).toHaveBeenCalledOnce();
    } finally {
      timeoutSpy.mockRestore();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it("uses GPT fallback instead of accepting a low-confidence Ollama result", async () => {
    const rules = vi.fn(() => ({
      violates: false,
      policy: "none",
      confidence: 20,
      evidence: "No rule match",
      source: "rules" as const,
    }));
    const ollama = {
      isAvailable: vi.fn(() => true),
      analyze: vi.fn(async () => ({
        violates: true,
        policy: "spam",
        confidence: 42,
        evidence: "Promotion",
        source: "ollama" as const,
      })),
    };
    const gpt = {
      analyze: vi.fn(async () => ({
        violates: false,
        policy: "none",
        confidence: 75,
        evidence: "",
        source: "gpt" as const,
      })),
    };

    const result = await analyzeReview(
      { text: "A review with uncertain promotional language." },
      { rules, ollama, gpt },
    );
    expect(result.source).toBe("gpt");
    expect(result.confidence).toBe(75);
    expect(gpt.analyze).toHaveBeenCalledOnce();
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

  it("does not treat a high-confidence non-violation from rules as a complete analysis", async () => {
    const ollama = {
      isAvailable: vi.fn(() => true),
      analyze: vi.fn(async () => ({
        violates: false,
        policy: "none",
        confidence: 80,
        evidence: "",
        source: "ollama" as const,
      })),
    };
    const result = await analyzeReview(
      { text: "A detailed account of a normal visit." },
      {
        rules: () => ({
          violates: false,
          policy: "none",
          confidence: 90,
          evidence: "No rule match",
        }),
        ollama,
        gpt: { analyze: vi.fn() },
        track: vi.fn(async () => undefined),
      },
    );

    expect(ollama.analyze).toHaveBeenCalledOnce();
    expect(result.source).toBe("ollama");
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
