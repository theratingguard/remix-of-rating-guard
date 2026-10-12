import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AI_LAYER_NAMES, type AiLayerUsageSummary } from "./ai-layer-usage";

export const getAiLayerUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiLayerUsageSummary> => {
    if ((await context.supabase.rpc("report_access_level").throwOnError()).data !== "super_admin")
      throw new Error("Access Denied: AI usage is available to Super Admin only.");

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const { data: rows } = await context.supabase
      .from("ai_layer_usage")
      .select("layer, duration_ms, cost_usd, created_at")
      .gte("created_at", monthStart)
      .order("created_at")
      .throwOnError();
    const usage = rows ?? [];
    const today = usage.filter((row) => row.created_at >= dayStart);
    const monthCost = usage.reduce((sum, row) => sum + Number(row.cost_usd), 0);
    const todayCost = today.reduce((sum, row) => sum + Number(row.cost_usd), 0);

    return {
      today_cases: today.length,
      month_cases: usage.length,
      today_cost_usd: Number(todayCost.toFixed(6)),
      month_cost_usd: Number(monthCost.toFixed(6)),
      layers: AI_LAYER_NAMES.map((layer) => {
        const matching = usage.filter((row) => row.layer === layer);
        const cost = matching.reduce((sum, row) => sum + Number(row.cost_usd), 0);
        const duration =
          matching.reduce((sum, row) => sum + row.duration_ms, 0) / (matching.length || 1);
        return {
          layer,
          cases: matching.length,
          handled_percent: usage.length ? (matching.length / usage.length) * 100 : 0,
          cost_usd: Number(cost.toFixed(6)),
          avg_duration_ms: Math.round(duration),
        };
      }),
    };
  });
