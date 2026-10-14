import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { summarizeAiLayerUsage, type AiLayerUsageSummary } from "./ai-layer-usage";

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
      .select("scan_id, layer, duration_ms, cost_usd, created_at")
      .gte("created_at", monthStart)
      .order("created_at")
      .throwOnError();
    return summarizeAiLayerUsage(rows ?? [], dayStart);
  });
