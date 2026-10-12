export const AI_LAYER_NAMES = ["rules", "ollama", "gpt"] as const;
export type AiLayer = (typeof AI_LAYER_NAMES)[number];

export type AiLayerUsage = {
  layer: AiLayer;
  handled_percent: number;
  cost_usd: number;
  avg_duration_ms: number;
};

export const aiLayerUsageSnapshot: Record<AiLayer, AiLayerUsage> = {
  rules: { layer: "rules", handled_percent: 80, cost_usd: 0, avg_duration_ms: 50 },
  ollama: { layer: "ollama", handled_percent: 15, cost_usd: 0, avg_duration_ms: 3000 },
  gpt: { layer: "gpt", handled_percent: 5, cost_usd: 0.01, avg_duration_ms: 5000 },
};

export function estimateLayerCostUsd(layer: AiLayer, scanCount = 1) {
  if (layer === "rules") return 0;
  const base = aiLayerUsageSnapshot[layer].cost_usd;
  return Number((base * scanCount).toFixed(4));
}

export function summarizeAiLayerUsage() {
  return {
    today_cost_usd: 0.12,
    month_cost_usd: 1.32,
    layers: Object.values(aiLayerUsageSnapshot),
  };
}

export function trackAiLayerUsage(_layer: AiLayer, _meta: Partial<Record<string, unknown>> = {}) {
  return {
    layer: _layer,
    recorded_at: new Date().toISOString(),
    ok: true,
  };
}
