import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { searchBusinesses } from "./google-places.server";
import { getSettings } from "./settings.server";
import { smtpConfigured } from "./email.server";
export const getIntegrationChecks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if ((await context.supabase.rpc("report_access_level").throwOnError()).data !== "super_admin")
      throw new Error("Access Denied: Super Admin diagnostics only.");
    const [checks, models, scans] = await Promise.all([
      context.supabase.from("service_checks").select("*").throwOnError(),
      context.supabase.from("ai_model_status").select("result").throwOnError(),
      context.supabase
        .from("scans")
        .select("created_at,completed_at")
        .eq("status", "complete")
        .eq("is_seed", false)
        .order("completed_at", { ascending: false })
        .limit(1)
        .throwOnError(),
    ]);
    return {
      checks: checks.data,
      models: models.data,
      lastScanVerified: scans.data[0]?.completed_at ?? null,
      emailAvailable: smtpConfigured(),
      whatsappAvailable: true,
      settings: await getSettings(),
    };
  });
export const testGoogleIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if ((await context.supabase.rpc("report_access_level").throwOnError()).data !== "super_admin")
      throw new Error("Access Denied: Super Admin diagnostics only.");
    const started = Date.now();
    let success = false,
      detail = "";
    try {
      const key = process.env["GOOGLE_PLACES_API_KEY"];
      if (!key) throw new Error("Google Places key not configured.");
      const businesses = await searchBusinesses(key, "The Hudson Albany NY");
      if (!businesses.length) throw new Error("Google returned no business results.");
      success = true;
      detail = `Official Places search responded in ${Date.now() - started} ms (${businesses.length} results).`;
    } catch (error) {
      detail = error instanceof Error ? error.message : "Google test failed";
      console.error("[google-test]", detail);
    }
    const result = {
      service: "google",
      success,
      detail: detail.slice(0, 1000),
      checked_at: new Date().toISOString(),
    };
    await context.supabase.from("service_checks").upsert(result).throwOnError();
    return result;
  });
