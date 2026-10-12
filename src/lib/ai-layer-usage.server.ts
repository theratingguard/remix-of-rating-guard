import type { AiLayer } from "./ai-layer-usage";

export async function recordAiLayerUsage(
  layer: AiLayer,
  meta: {
    scanId?: string;
    reviewId?: string;
    durationMs: number;
    costUsd: number;
  },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("ai_layer_usage")
    .insert({
      scan_id: meta.scanId ?? null,
      review_id: meta.reviewId ?? null,
      layer,
      duration_ms: meta.durationMs,
      cost_usd: meta.costUsd,
    })
    .throwOnError();
}
