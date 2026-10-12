import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ANALYSIS_MODEL, AI_PROVIDER } from "./analysis.server";
import { APP_VERSION } from "./version";
import { submitScanCore, scanAnalyzeCore, audit, type StageResponse } from "./scan-core.server";
import { searchBusinesses } from "./google-places.server";
import { getSettings } from "./settings.server";
import { enabledModelIndices, modelNames } from "./settings";
import { modelStatusSchema } from "./model-test.server";
import { REGIONS } from "./regional-routing";

export const findBusinesses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ query: z.string().trim().min(3).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const key = process.env["GOOGLE_PLACES_API_KEY"];
    if (!key) throw new Error("Google business search is not configured.");
    try {
      return await searchBusinesses(key, data.query);
    } catch (error) {
      console.error("[business-search] Google search failed", error);
      throw error;
    }
  });

export { APP_VERSION };
export type { StageResponse };

type Health = "healthy" | "warning" | "unavailable";

export const getSystemStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const t0 = Date.now();
    const db = await context.supabase.from("scans").select("id", { head: true, count: "exact" });
    const dbMs = Date.now() - t0;
    const tables = await Promise.all(
      ["businesses", "review_analyses", "reports", "audit_log"].map((t) =>
        context.supabase.from(t as "reports").select("id", { head: true, count: "exact" }),
      ),
    );
    const migrationsOk = tables.every((r) => !r.error);
    const googleConfigured = Boolean(process.env["GOOGLE_PLACES_API_KEY"]);
    const settings = await getSettings();
    const enabled = [
      settings.gpt_enabled,
      settings.claude_enabled,
      settings.gemini_enabled,
    ].flatMap((on, index) => (on ? [index] : []));
    const active = settings.multi_model_enabled ? enabled : enabled.slice(0, 1);
    const aiConfigured =
      active.length > 0 &&
      active.every((index) =>
        Boolean(process.env[["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"][index]!]),
      );
    const [googleChecks, modelChecks, latestScan] = await Promise.all([
      context.supabase
        .from("service_checks")
        .select("*")
        .eq("service", "google")
        .maybeSingle()
        .throwOnError(),
      context.supabase.from("ai_model_status").select("result").throwOnError(),
      context.supabase
        .from("scans")
        .select("completed_at")
        .eq("status", "complete")
        .eq("is_seed", false)
        .order("completed_at", { ascending: false })
        .limit(1)
        .throwOnError(),
    ]);
    const tested = modelChecks.data.map((row) => modelStatusSchema.parse(row.result));
    const fresh = (date: string) => Date.now() - Date.parse(date) < 86400000;
    const latestVerified = latestScan.data[0]?.completed_at;
    const liveVerified = latestVerified && fresh(latestVerified);
    const aiTestsActive =
      active.length > 0 &&
      active.every((index) =>
        tested.some(
          (item) =>
            item.model === (["gpt", "claude", "gemini"] as const)[index] &&
            item.status === "active" &&
            fresh(item.checked_at),
        ),
      );
    const googleVerified = googleChecks.data?.success && fresh(googleChecks.data.checked_at);
    const checks: { name: string; status: Health; detail: string }[] = [
      { name: "Application", status: "healthy", detail: `Version ${APP_VERSION} responding` },
      {
        name: "Database",
        status: db.error ? "unavailable" : "healthy",
        detail: db.error ? db.error.message : `Responded in ${dbMs} ms`,
      },
      {
        name: "Google API",
        status: googleConfigured && (googleVerified || liveVerified) ? "healthy" : "warning",
        detail: googleConfigured
          ? `Last verified: ${googleVerified ? googleChecks.data?.checked_at : liveVerified ? latestVerified : "Not recently verified"}. Use Test Google API for a fresh paid diagnostic.`
          : "Configuration required — GOOGLE_PLACES_API_KEY not set",
      },
      {
        name: "AI service",
        status: aiConfigured ? (aiTestsActive ? "healthy" : "warning") : "unavailable",
        detail: aiConfigured
          ? `${active.map((index) => modelNames[index]).join(" + ")}. Last verified: ${aiTestsActive ? "See each model's persisted test date" : "No recent successful test of every currently enabled provider"}. Use Test All Models for current provider health.`
          : "All models disabled or an enabled provider credential is missing",
      },
      {
        name: "Storage",
        status: "healthy",
        detail: "Not required — reports are generated on demand",
      },
      {
        name: "Authentication",
        status: context.userId ? "healthy" : "unavailable",
        detail: "User session verified",
      },
    ];
    return {
      googleConfigured,
      aiConfigured,
      aiProvider: active.map((index) => modelNames[index]).join(" + "),
      aiModel: settings.multi_model_enabled
        ? `${active.length} enabled model(s)`
        : "First enabled provider only",
      databaseOk: !db.error,
      migrationsOk,
      reviewLimit: 5,
      version: APP_VERSION,
      environment: process.env["NODE_ENV"] === "production" ? "production" : "development",
      checks,
      checkedAt: new Date().toISOString(),
    };
  });

/** Stage 1: resolve business, read public place data, retrieve available reviews. */
export const scanFetch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        url: z.string().trim().min(5).max(2000),
        batchId: z.string().uuid().optional(),
        region: z.enum(REGIONS).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<StageResponse> =>
    submitScanCore(context.supabase, context.userId, data),
  );

/** Stage 2: analyze review signals, classify risk, prepare report. */
export const scanAnalyze = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ scanId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<StageResponse> => {
    if (process.env["MULTI_WORKER_ENABLED"] === "true") {
      const { retryWorkerTask } = await import("./queue/pipeline.server");
      await retryWorkerTask(data.scanId, context.userId);
      return { ok: true, queued: true, scanId: data.scanId, reviews: 0 };
    }
    return scanAnalyzeCore(context.supabase, context.userId, data);
  });

export const logAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        action: z.enum([
          "report.downloaded",
          "settings.password_changed",
          "settings.profile_updated",
          "auth.logout_all",
        ]),
        detail: z.record(z.string(), z.string()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await audit(context.supabase, context.userId, data.action, data.detail ?? {});
    return { ok: true };
  });

export const getAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("audit_log")
      .select("action, created_at")
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) throw new Error("Could not load audit history.");
    return data ?? [];
  });

export const createBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ total: z.number().int().min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: b, error } = await context.supabase
      .from("scan_batches")
      .insert({ user_id: context.userId, total: data.total })
      .select("id, batch_number")
      .single();
    if (error || !b) throw new Error("Database unavailable — batch could not be created.");
    await audit(context.supabase, context.userId, "batch.started", {
      batch_id: b.id,
      total: data.total,
    });
    return b;
  });
