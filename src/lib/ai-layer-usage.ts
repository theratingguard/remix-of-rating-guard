export const AI_LAYER_NAMES = ["rules", "ollama", "gpt"] as const;
export type AiLayer = (typeof AI_LAYER_NAMES)[number];

export const AI_LAYER_TARGETS: Record<
  AiLayer,
  { handledPercent: number; costUsd: number; avgDurationMs: number }
> = {
  rules: { handledPercent: 80, costUsd: 0, avgDurationMs: 50 },
  ollama: { handledPercent: 15, costUsd: 0, avgDurationMs: 3000 },
  gpt: { handledPercent: 5, costUsd: 0.01, avgDurationMs: 5000 },
};

export function estimateAiSavingsPercent(cases: number, actualCostUsd: number): number | null {
  const baselineCost = Math.max(0, cases) * AI_LAYER_TARGETS.gpt.costUsd;
  if (baselineCost === 0) return null;
  const actualCost = Math.max(0, actualCostUsd);
  return Math.max(0, Math.min(100, ((baselineCost - actualCost) / baselineCost) * 100));
}

export type AiLayerUsage = {
  layer: AiLayer;
  cases: number;
  handled_percent: number;
  cost_usd: number;
  avg_duration_ms: number;
};

export type AiLayerUsageSummary = {
  today_cases: number;
  month_cases: number;
  today_cost_usd: number;
  month_cost_usd: number;
  layers: AiLayerUsage[];
};
