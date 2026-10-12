import { rulesEngine, type RulesResult, type RulesReview } from "./rules-engine.server";

export type OrchestratorResult = Omit<RulesResult, "source"> & {
  source: "rules" | "ollama" | "gpt";
};

type LayerResult = Omit<RulesResult, "source"> & { source?: "rules" | "ollama" | "gpt" };

export type OrchestratorDeps = {
  rules?: (review: RulesReview) => LayerResult;
  ollama?: {
    isAvailable: () => boolean;
    analyze: (review: RulesReview) => Promise<LayerResult>;
  };
  gpt?: {
    analyze: (review: RulesReview) => Promise<LayerResult>;
  };
};

const defaultOllama: NonNullable<OrchestratorDeps["ollama"]> = {
  isAvailable: () => false,
  analyze: async (): Promise<LayerResult> => ({
    violates: false,
    policy: "none",
    confidence: 0,
    evidence: "Ollama unavailable.",
    source: "rules",
  }),
};

const defaultGpt: NonNullable<OrchestratorDeps["gpt"]> = {
  analyze: async (): Promise<LayerResult> => ({
    violates: false,
    policy: "none",
    confidence: 0,
    evidence: "GPT fallback without policy support.",
    source: "rules",
  }),
};

export async function analyzeReview(
  review: RulesReview,
  deps: OrchestratorDeps = {},
): Promise<OrchestratorResult> {
  const rules = deps.rules ?? rulesEngine;
  const ruleResult = rules(review);
  if (ruleResult.confidence >= 70) {
    return {
      ...ruleResult,
      source: "rules",
    };
  }

  const ollama = deps.ollama ?? defaultOllama;
  if (ollama.isAvailable()) {
    const ollamaResult = await ollama.analyze(review);
    if (ollamaResult.confidence >= 60) {
      return {
        ...ollamaResult,
        source: "ollama",
      };
    }
  }

  const gpt = deps.gpt ?? defaultGpt;
  const gptResult = await gpt.analyze(review);
  return {
    ...gptResult,
    source: "gpt",
  };
}

export const aiOrchestrator = {
  analyzeReview,
};
