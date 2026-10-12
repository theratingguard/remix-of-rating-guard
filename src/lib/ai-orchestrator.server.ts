import { z } from "zod";
import { analyzeWithThreeModels, type Consensus } from "./multi-model.server";
import { getSettings } from "./settings.server";
import { recordAiLayerUsage } from "./ai-layer-usage.server";
import { rulesEngine, type RulesResult, type RulesReview } from "./rules-engine.server";

export type OrchestratorResult = Omit<RulesResult, "source"> & {
  source: "rules" | "ollama" | "gpt";
  consensus?: Consensus;
};

type LayerResult = Omit<RulesResult, "source"> & {
  source?: "rules" | "ollama" | "gpt";
  consensus?: Consensus;
};
type UsageContext = { scanId?: string; reviewId?: string };

export type OrchestratorDeps = {
  rules?: (review: RulesReview) => LayerResult;
  ollama?: {
    isAvailable: () => boolean | Promise<boolean>;
    analyze: (review: RulesReview) => Promise<LayerResult>;
  };
  gpt?: {
    analyze: (review: RulesReview) => Promise<LayerResult>;
  };
  track?: (
    layer: OrchestratorResult["source"],
    meta: UsageContext & {
      durationMs: number;
      costUsd: number;
    },
  ) => Promise<void>;
  usageContext?: UsageContext;
};

const ollamaOutputSchema = z.object({
  violates: z.boolean(),
  policy: z.string().min(1).max(100),
  confidence: z.number().min(0).max(100),
  evidence: z.string().max(2000),
});

const ollamaBaseUrl = () =>
  (process.env["OLLAMA_BASE_URL"] ?? "http://127.0.0.1:11434").replace(/\/+$/, "");

let ollamaAvailability: { checkedAt: number; available: boolean } | undefined;

async function isOllamaAvailable() {
  if (ollamaAvailability && Date.now() - ollamaAvailability.checkedAt < 10_000)
    return ollamaAvailability.available;
  try {
    const response = await fetch(`${ollamaBaseUrl()}/api/tags`, {
      signal: AbortSignal.timeout(1_000),
    });
    ollamaAvailability = { checkedAt: Date.now(), available: response.ok };
    return response.ok;
  } catch (error) {
    ollamaAvailability = { checkedAt: Date.now(), available: false };
    console.warn(
      "[ai-orchestrator] Ollama unavailable; using the next configured layer.",
      error instanceof Error ? error.message : "Unknown connection error",
    );
    return false;
  }
}

async function analyzeWithOllama(review: RulesReview): Promise<LayerResult> {
  const text = review.text ?? review.reviewText ?? "";
  const response = await fetch(`${ollamaBaseUrl()}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: process.env["OLLAMA_MODEL"] ?? "llama3.1:8b",
      stream: false,
      format: "json",
      prompt: [
        "Assess only the supplied Google review for an explicit Google review-policy concern.",
        "A negative opinion, short text, or missing reviewer metadata alone is not proof.",
        'Return JSON only: {"violates":boolean,"policy":"short policy label or none","confidence":0-100,"evidence":"exact quote from the review or empty"}.',
        `Review: ${JSON.stringify(text)}`,
      ].join("\n"),
    }),
  });
  if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
  const payload: unknown = await response.json();
  const generated = z.object({ response: z.string() }).parse(payload);
  const result = ollamaOutputSchema.parse(JSON.parse(generated.response));
  if (result.evidence && !text.includes(result.evidence))
    throw new Error("Ollama returned evidence that is not present in the source review.");
  return { ...result, source: "ollama" };
}

async function analyzeWithGpt(review: RulesReview): Promise<LayerResult> {
  const [settings, apiKey] = await Promise.all([
    getSettings(),
    Promise.resolve(process.env["OPENAI_API_KEY"]),
  ]);
  if (!settings.gpt_enabled || !apiKey)
    throw new Error("GPT fallback is unavailable: enable GPT and configure its server key.");

  const text = review.text ?? review.reviewText ?? "";
  const [result] = await analyzeWithThreeModels(
    apiKey,
    review.business?.name ?? "Unknown business",
    null,
    [
      {
        author: review.reviewer?.name ?? "Anonymous",
        authorUri: null,
        rating: review.rating ?? 3,
        publishedAt: null,
        relativeTime: null,
        text,
        reviewUri: null,
      },
    ],
    [0],
  );
  if (!result) throw new Error("GPT fallback returned no review analysis.");
  return {
    violates: result.risk === "high" || result.risk === "medium",
    policy: result.category ?? "none",
    confidence: result.confidence,
    evidence: result.evidence ?? "",
    source: "gpt",
    consensus: result.consensus,
  };
}

export async function analyzeReview(
  review: RulesReview,
  deps: OrchestratorDeps = {},
): Promise<OrchestratorResult> {
  const startedAt = Date.now();
  const rules = deps.rules ?? rulesEngine;
  const ruleResult = rules(review);
  let result: OrchestratorResult;

  if (ruleResult.confidence >= 70) {
    result = { ...ruleResult, source: "rules" };
  } else {
    const ollama = deps.ollama ?? { isAvailable: isOllamaAvailable, analyze: analyzeWithOllama };
    let ollamaResult: LayerResult | undefined;
    try {
      if (await ollama.isAvailable()) ollamaResult = await ollama.analyze(review);
    } catch (error) {
      console.warn(
        "[ai-orchestrator] Ollama analysis failed; using GPT fallback.",
        error instanceof Error ? error.message : "Unknown Ollama error",
      );
    }

    if (ollamaResult && ollamaResult.confidence >= 60) {
      result = { ...ollamaResult, source: "ollama" };
    } else {
      const gpt = deps.gpt ?? { analyze: analyzeWithGpt };
      const gptResult = await gpt.analyze(review);
      result = { ...gptResult, source: "gpt" };
    }
  }

  if (!result.micro_score && ruleResult.micro_score) {
    result = {
      ...result,
      micro_score: ruleResult.micro_score,
      ...(ruleResult.micro_checks ? { micro_checks: ruleResult.micro_checks } : {}),
    };
  }

  const durationMs = Date.now() - startedAt;
  try {
    await (deps.track ?? recordAiLayerUsage)(result.source, {
      ...deps.usageContext,
      durationMs,
      costUsd: result.source === "gpt" ? 0.01 : 0,
    });
  } catch (error) {
    console.error(
      "[ai-orchestrator] Could not persist layer usage.",
      error instanceof Error ? error.message : "Unknown persistence error",
    );
  }
  return result;
}

export const aiOrchestrator = { analyzeReview };
