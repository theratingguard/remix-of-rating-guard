import { z } from "zod";

export const settingsSchema = z.object({
  gpt_enabled: z.boolean(),
  claude_enabled: z.boolean(),
  gemini_enabled: z.boolean(),
  multi_model_enabled: z.boolean(),
  bulk_scan_enabled: z.boolean(),
  legal_expert_enabled: z.boolean(),
  auto_pdf_enabled: z.boolean(),
  whatsapp_share_enabled: z.boolean(),
  email_share_enabled: z.boolean(),
  appeal_tracking_enabled: z.boolean(),
  bulk_daily_limit: z.number().int().min(1).max(5000),
  single_hourly_limit: z.number().int().min(1).max(1000),
  rate_limit_per_min: z.number().int().min(1).max(10),
  pdf_retention_days: z.number().int().min(1).max(90),
});
export type AppSettings = z.infer<typeof settingsSchema>;
export const defaultSettings: AppSettings = {
  gpt_enabled: true,
  claude_enabled: true,
  gemini_enabled: true,
  multi_model_enabled: true,
  bulk_scan_enabled: true,
  legal_expert_enabled: true,
  auto_pdf_enabled: true,
  whatsapp_share_enabled: true,
  email_share_enabled: false,
  appeal_tracking_enabled: true,
  bulk_daily_limit: 500,
  single_hourly_limit: 100,
  rate_limit_per_min: 10,
  pdf_retention_days: 90,
};
export const modelKeys = ["gpt_enabled", "claude_enabled", "gemini_enabled"] as const;
export const modelNames = ["GPT-4o", "Claude Sonnet", "Gemini Flash"] as const;
export type ModelId = "gpt" | "claude" | "gemini";
export function enabledModelIndices(settings: AppSettings) {
  const enabled = modelKeys.flatMap((key, index) => (settings[key] ? [index] : []));
  if (!enabled.length)
    throw new Error("All AI models are disabled. Enable at least one model in Settings.");
  return settings.multi_model_enabled ? enabled : [enabled[0]!];
}
