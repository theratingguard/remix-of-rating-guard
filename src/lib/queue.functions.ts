import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseBulkInput, starBreakdown, removalSummary } from "./review-metrics";
import { savedLegalAnalysis } from "./legal-analysis";
import { requireFeature } from "./settings.server";
import { MAX_BULK_INPUTS } from "./bulk-import";

const startOfDayUtc = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
};

/** Queue a bulk batch. Enforces the daily link cap and skips duplicate links. */
export const enqueueBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({ urls: z.array(z.string().trim().min(3).max(2000)).min(1).max(MAX_BULK_INPUTS) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const access = await context.supabase.rpc("report_access_level").throwOnError();
    if (access.data !== "super_admin")
      throw new Error("Access Denied: summary-only accounts cannot queue detailed scans.");
    const controls = await requireFeature("bulk_scan_enabled");
    if (!process.env["GOOGLE_PLACES_API_KEY"])
      return { ok: false as const, message: "Google Places API is not configured." };
    const enabledKeys = [
      controls.gpt_enabled && process.env["OPENAI_API_KEY"],
      controls.claude_enabled && process.env["ANTHROPIC_API_KEY"],
      controls.gemini_enabled && process.env["GEMINI_API_KEY"],
    ];
    if (!enabledKeys.some(Boolean))
      return { ok: false as const, message: "No enabled AI provider is configured on the server." };
    if (!process.env["SUPABASE_SERVICE_ROLE_KEY"])
      return { ok: false as const, message: "Queue credentials are not configured on the server." };
    if (process.env["SCAN_WORKER_SCHEDULED"] !== "true")
      return {
        ok: false as const,
        message: "Background worker scheduling has not been verified. Bulk scanning is disabled.",
      };
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const parsed = parseBulkInput(data.urls.join("\n"));
    if (parsed.invalid.length || data.urls.some((input) => /[\r\n]/.test(input)))
      throw new Error("Invalid bulk inputs; fix all lines before starting. Nothing queued.");
    const urls = parsed.valid;
    if (!urls.length) throw new Error("No valid bulk inputs.");
    await context.supabase
      .rpc("reserve_scan_admission", { _kind: "bulk", _quantity: urls.length })
      .throwOnError();
    const { data: state, error: stateError } = await admin
      .from("system_state")
      .select("daily_link_cap, queue_paused, pause_reason")
      .eq("id", "main")
      .single();
    if (stateError) throw new Error("Could not read queue admission configuration.");
    const since = startOfDayUtc();
    const [{ count: jobsToday }, { count: singlesToday }] = await Promise.all([
      admin
        .from("scan_jobs")
        .select("id", { head: true, count: "exact" })
        .gte("created_at", since)
        .throwOnError(),
      admin
        .from("scans")
        .select("id", { head: true, count: "exact" })
        .gte("created_at", since)
        .is("batch_id", null)
        .throwOnError(),
    ]);
    const used = (jobsToday ?? 0) + (singlesToday ?? 0);
    const cap = state?.daily_link_cap ?? 1000;
    if (used + urls.length > cap)
      return {
        ok: false as const,
        message: `Daily limit of ${cap} links reached (${used} used today). Try a smaller batch or wait until tomorrow (UTC).`,
      };

    const { data: b, error } = await context.supabase
      .from("scan_batches")
      .insert({ user_id: context.userId, total: urls.length })
      .select("id, batch_number")
      .single();
    if (error || !b)
      return { ok: false as const, message: "Database unavailable — batch could not be created." };
    const ins = await admin
      .from("scan_jobs")
      .insert(
        urls.map((url, position) => ({ batch_id: b.id, user_id: context.userId, url, position })),
      );
    if (ins.error) {
      await admin
        .from("scan_batches")
        .update({ control_status: "cancelled" })
        .eq("id", b.id)
        .throwOnError();
      throw new Error("Database unavailable — inputs could not be queued; batch cancelled.");
    }
    await context.supabase.from("audit_log").insert({
      user_id: context.userId,
      action: "batch.started",
      detail: { batch_id: b.id, total: urls.length },
      resource: "batch",
      resource_id: b.id,
    });
    return {
      ok: true as const,
      batch: b,
      paused: !!state?.queue_paused,
      pauseReason: state?.pause_reason ?? null,
    };
  });

/** Process queued jobs now (bounded). Called by the open bulk page; the scheduled worker covers the rest. */
export const processQueueNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw new Error("Could not verify admin access.");
    if (!isAdmin) throw new Error("Forbidden");
    const { runWorker } = await import("./queue.server");
    return runWorker({ deadlineMs: 20_000 });
  });

export const getBatchJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ batchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const batch = await context.supabase
      .from("scan_batches")
      .select("control_status")
      .eq("id", data.batchId)
      .eq("user_id", context.userId)
      .maybeSingle()
      .throwOnError();
    if (!batch.data) throw new Error("Batch not found or Access Denied.");
    const jobs = [];
    for (let offset = 0; ; offset += 500) {
      const result = await context.supabase
        .from("scan_jobs")
        .select("id, url, position, status, attempts, error, scan_id, next_run_at")
        .eq("batch_id", data.batchId)
        .order("position")
        .range(offset, offset + 499)
        .throwOnError();
      jobs.push(...result.data);
      if (result.data.length < 500) break;
      if (jobs.length > MAX_BULK_INPUTS) throw new Error("Batch exceeds supported export size.");
    }
    const ids = (jobs ?? []).map((j) => j.scan_id).filter(Boolean) as string[];
    const { data: scans } = ids.length
      ? {
          data: (
            await Promise.all(
              Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) =>
                context.supabase
                  .from("scans")
                  .select(
                    "id, business_name, rating, total_reviews, reviews_retrieved, high_count, medium_count",
                  )
                  .in("id", ids.slice(index * 100, (index + 1) * 100))
                  .throwOnError(),
              ),
            )
          ).flatMap((result) => result.data),
        }
      : { data: [] };
    const byId = new Map((scans ?? []).map((s) => [s.id, s]));
    const [reviews, reports] = ids.length
      ? await Promise.all([
          Promise.all(
            Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) =>
              context.supabase
                .from("reviews")
                .select("scan_id,rating")
                .in("scan_id", ids.slice(index * 100, (index + 1) * 100))
                .throwOnError(),
            ),
          ).then((results) => ({ data: results.flatMap((result) => result.data ?? []) })),
          Promise.all(
            Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) =>
              context.supabase
                .from("reports")
                .select("scan_id,report_data")
                .in("scan_id", ids.slice(index * 100, (index + 1) * 100))
                .throwOnError(),
            ),
          ).then((results) => ({ data: results.flatMap((result) => result.data) })),
        ])
      : [{ data: [] }, { data: [] }];
    const { data: state } = await context.supabase
      .from("system_state")
      .select("queue_paused, pause_reason")
      .eq("id", "main")
      .maybeSingle()
      .throwOnError();
    return {
      jobs: (jobs ?? []).map((j) => ({
        ...j,
        scan: j.scan_id ? (byId.get(j.scan_id) ?? null) : null,
        reportUrl:
          j.status === "completed" &&
          j.scan_id &&
          reports.data.some((report) => report.scan_id === j.scan_id)
            ? `https://ratingguard.online/reports/${j.scan_id}`
            : null,
        stars: starBreakdown((reviews.data ?? []).filter((review) => review.scan_id === j.scan_id)),
        removal: removalSummary(
          savedLegalAnalysis(
            (reports.data ?? []).find((report) => report.scan_id === j.scan_id)?.report_data,
          )?.reviews ?? [],
          byId.get(j.scan_id ?? "")?.reviews_retrieved ?? 0,
        ),
      })),
      paused: !!state?.queue_paused,
      pauseReason: state?.pause_reason ?? null,
      controlStatus: batch.data.control_status,
    };
  });

export const latestBatch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const result = await context.supabase
      .from("scan_batches")
      .select("id,batch_number")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .throwOnError();
    return result.data;
  });

export const controlBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({ batchId: z.string().uuid(), action: z.enum(["pause", "resume", "cancel"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const update = await admin
      .from("scan_batches")
      .update({
        control_status:
          data.action === "pause" ? "paused" : data.action === "resume" ? "running" : "cancelled",
      })
      .eq("id", data.batchId)
      .eq("user_id", context.userId)
      .neq("control_status", "cancelled")
      .select("id")
      .maybeSingle()
      .throwOnError();
    if (!update.data) throw new Error("Batch not found, cancelled, or Access Denied.");
    if (data.action === "cancel")
      await admin
        .from("scan_jobs")
        .update({ status: "cancelled", error: "Cancelled by owner", locked_until: null })
        .eq("batch_id", data.batchId)
        .eq("user_id", context.userId)
        .eq("status", "pending")
        .throwOnError();
    return { ok: true };
  });

export const retryJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: job, error } = await context.supabase
      .from("scan_jobs")
      .select("id, user_id, status")
      .eq("id", data.jobId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error("Could not load the job.");
    if (!job) return { ok: false };
    if (job.status !== "failed" && job.status !== "partial") return { ok: false };
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error: updateError } = await admin
      .from("scan_jobs")
      .update({
        status: "pending",
        attempts: 0,
        error: null,
        next_run_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("user_id", context.userId)
      .in("status", ["failed", "partial"])
      .select("id")
      .maybeSingle();
    if (updateError) throw new Error("Could not retry the job.");
    if (updated && process.env["MULTI_WORKER_ENABLED"] === "true") {
      const task = (
        await admin
          .from("worker_tasks")
          .select("scan_id,user_id,status")
          .eq("bulk_job_id", job.id)
          .maybeSingle()
          .throwOnError()
      ).data;
      if (task?.status === "failed") {
        const { retryWorkerTask } = await import("./queue/pipeline.server");
        await retryWorkerTask(task.scan_id, task.user_id);
      }
    }
    return { ok: !!updated };
  });

export const getQueueState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: state } = await context.supabase
      .from("system_state")
      .select("queue_paused, pause_reason, paused_at, daily_link_cap, last_worker_run")
      .eq("id", "main")
      .single()
      .throwOnError();
    const { data: isAdmin } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" })
      .throwOnError();
    const since = startOfDayUtc();
    const [{ count: pending }, { count: jobsToday }, { count: singles }] = await Promise.all([
      context.supabase
        .from("scan_jobs")
        .select("id", { head: true, count: "exact" })
        .in("status", ["pending", "processing"])
        .throwOnError(),
      context.supabase
        .from("scan_jobs")
        .select("id", { head: true, count: "exact" })
        .gte("created_at", since)
        .throwOnError(),
      context.supabase
        .from("scans")
        .select("id", { head: true, count: "exact" })
        .gte("created_at", since)
        .is("batch_id", null)
        .throwOnError(),
    ]);
    return {
      ...state,
      isAdmin: !!isAdmin,
      pending: pending ?? 0,
      usedToday: (jobsToday ?? 0) + (singles ?? 0),
    };
  });

/** Admin only: resume a paused queue after fixing keys or billing. */
export const resumeQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    await admin
      .from("system_state")
      .update({
        queue_paused: false,
        pause_reason: null,
        paused_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "main")
      .throwOnError();
    return { ok: true };
  });
