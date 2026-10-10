import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getSettings, invalidateSettings } from "./settings.server";
import { settingsSchema } from "./settings";
import { testModel, modelStatusSchema } from "./model-test.server";

export const getFeatureSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(() => getSettings());
export const getAiControlPanel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if ((await context.supabase.rpc("report_access_level").throwOnError()).data !== "super_admin")
      throw new Error("Access Denied: Super Admin settings only.");
    const statuses = await context.supabase.from("ai_model_status").select("result").throwOnError();
    return {
      settings: await getSettings(),
      statuses: statuses.data.map((row) => modelStatusSchema.parse(row.result)),
    };
  });
export const saveAiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => settingsSchema.parse(input))
  .handler(async ({ context, data }) => {
    try {
      await context.supabase.rpc("update_app_settings", { _settings: data }).throwOnError();
      invalidateSettings();
      return await getSettings();
    } catch (error) {
      console.error(
        "[settings] Update failed",
        error instanceof Error ? error.message : "Unknown error",
      );
      throw error;
    }
  });
export const runModelTests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ model: z.enum(["gpt", "claude", "gemini", "all"]) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    if ((await context.supabase.rpc("report_access_level").throwOnError()).data !== "super_admin")
      throw new Error("Access Denied: Super Admin model tests only.");
    const results = await Promise.all(
      (data.model === "all" ? (["gpt", "claude", "gemini"] as const) : [data.model]).map((model) =>
        testModel(model),
      ),
    );
    await context.supabase
      .from("ai_model_status")
      .upsert(
        results.map((result) => ({
          model: result.model,
          result,
          updated_at: result.checked_at,
        })),
      )
      .throwOnError();
    return results;
  });
