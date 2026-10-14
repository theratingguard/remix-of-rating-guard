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
  month_scan_count: number;
  month_avg_cost_per_scan_usd: number;
  latest_scan_cost_usd: number;
  latest_scan_cases: number;
  layers: AiLayerUsage[];
};

export type AiLayerUsageRecord = {
  scan_id: string | null;
  layer: AiLayer;
  duration_ms: number;
  cost_usd: number;
  created_at: string;
};

export function summarizeAiLayerUsage(
  rows: readonly AiLayerUsageRecord[],
  dayStart: string,
): AiLayerUsageSummary {
  const today = rows.filter((row) => row.created_at >= dayStart);
  const todayCost = today.reduce((sum, row) => sum + row.cost_usd, 0);
  const monthCost = rows.reduce((sum, row) => sum + row.cost_usd, 0);
  const scanTotals = new Map<string, { cost: number; cases: number; lastSeen: string }>();

  for (const row of rows) {
    if (!row.scan_id) continue;
    const total = scanTotals.get(row.scan_id) ?? {
      cost: 0,
      cases: 0,
      lastSeen: row.created_at,
    };
    total.cost += row.cost_usd;
    total.cases += 1;
    if (row.created_at > total.lastSeen) total.lastSeen = row.created_at;
    scanTotals.set(row.scan_id, total);
  }

  const latestScan = [...scanTotals.values()].reduce<
    { cost: number; cases: number; lastSeen: string } | undefined
  >((latest, scan) => (!latest || scan.lastSeen > latest.lastSeen ? scan : latest), undefined);
  const trackedScanCost = [...scanTotals.values()].reduce((sum, scan) => sum + scan.cost, 0);

  return {
    today_cases: today.length,
    month_cases: rows.length,
    today_cost_usd: Number(todayCost.toFixed(6)),
    month_cost_usd: Number(monthCost.toFixed(6)),
    month_scan_count: scanTotals.size,
    month_avg_cost_per_scan_usd: Number((trackedScanCost / (scanTotals.size || 1)).toFixed(6)),
    latest_scan_cost_usd: Number((latestScan?.cost ?? 0).toFixed(6)),
    latest_scan_cases: latestScan?.cases ?? 0,
    layers: AI_LAYER_NAMES.map((layer) => {
      const matching = rows.filter((row) => row.layer === layer);
      const cost = matching.reduce((sum, row) => sum + row.cost_usd, 0);
      const duration =
        matching.reduce((sum, row) => sum + row.duration_ms, 0) / (matching.length || 1);
      return {
        layer,
        cases: matching.length,
        handled_percent: rows.length ? (matching.length / rows.length) * 100 : 0,
        cost_usd: Number(cost.toFixed(6)),
        avg_duration_ms: Math.round(duration),
      };
    }),
  };
}
