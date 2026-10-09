import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const startOfDayUtc = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.toISOString(); };

/** Queue a bulk batch. Enforces the daily link cap and skips duplicate links. */
export const enqueueBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ urls: z.array(z.string().trim().min(5).max(2000)).min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!process.env["GOOGLE_PLACES_API_KEY"]) return { ok: false as const, message: "Google Places API is not configured." };
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const urls = [...new Set(data.urls)];
    const { data: state } = await admin.from("system_state").select("daily_link_cap, queue_paused, pause_reason").eq("id", "main").single();
    const since = startOfDayUtc();
    const [{ count: jobsToday }, { count: singlesToday }] = await Promise.all([
      admin.from("scan_jobs").select("id", { head: true, count: "exact" }).gte("created_at", since),
      admin.from("scans").select("id", { head: true, count: "exact" }).gte("created_at", since).is("batch_id", null),
    ]);
    const used = (jobsToday ?? 0) + (singlesToday ?? 0);
    const cap = state?.daily_link_cap ?? 1000;
    if (used + urls.length > cap) return { ok: false as const, message: `Daily limit of ${cap} links reached (${used} used today). Try a smaller batch or wait until tomorrow (UTC).` };

    const { data: b, error } = await context.supabase.from("scan_batches").insert({ user_id: context.userId, total: urls.length }).select("id, batch_number").single();
    if (error || !b) return { ok: false as const, message: "Database unavailable — batch could not be created." };
    const ins = await admin.from("scan_jobs").insert(urls.map((url, position) => ({ batch_id: b.id, user_id: context.userId, url, position })));
    if (ins.error) return { ok: false as const, message: "Database unavailable — links could not be queued." };
    await context.supabase.from("audit_log").insert({ user_id: context.userId, action: "batch.started", detail: { batch_id: b.id, total: urls.length }, resource: "batch", resource_id: b.id });
    return { ok: true as const, batch: b, paused: !!state?.queue_paused, pauseReason: state?.pause_reason ?? null };
  });

/** Process queued jobs now (bounded). Called by the open bulk page; the scheduled worker covers the rest. */
export const processQueueNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { runWorker } = await import("./queue.server");
    return runWorker({ deadlineMs: 20_000 });
  });

export const getBatchJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ batchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: jobs } = await context.supabase.from("scan_jobs").select("id, url, position, status, attempts, error, scan_id, next_run_at").eq("batch_id", data.batchId).order("position");
    const ids = (jobs ?? []).map((j) => j.scan_id).filter(Boolean) as string[];
    const { data: scans } = ids.length ? await context.supabase.from("scans").select("id, business_name, rating, reviews_retrieved, high_count, medium_count").in("id", ids) : { data: [] };
    const byId = new Map((scans ?? []).map((s) => [s.id, s]));
    const { data: state } = await context.supabase.from("system_state").select("queue_paused, pause_reason").eq("id", "main").maybeSingle();
    return { jobs: (jobs ?? []).map((j) => ({ ...j, scan: j.scan_id ? byId.get(j.scan_id) ?? null : null })), paused: !!state?.queue_paused, pauseReason: state?.pause_reason ?? null };
  });

export const retryJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase.from("scan_jobs").select("id, status").eq("id", data.jobId).maybeSingle();
    if (!job) return { ok: false };
    if (job.status !== "failed" && job.status !== "partial") return { ok: false };
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    await admin.from("scan_jobs").update({ status: "pending", attempts: 0, error: null, next_run_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
    return { ok: true };
  });

export const getQueueState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: state } = await context.supabase.from("system_state").select("queue_paused, pause_reason, paused_at, daily_link_cap, last_worker_run").eq("id", "main").maybeSingle();
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const since = startOfDayUtc();
    const [{ count: pending }, { count: jobsToday }, { count: singles }] = await Promise.all([
      admin.from("scan_jobs").select("id", { head: true, count: "exact" }).in("status", ["pending", "processing"]),
      admin.from("scan_jobs").select("id", { head: true, count: "exact" }).gte("created_at", since),
      admin.from("scans").select("id", { head: true, count: "exact" }).gte("created_at", since).is("batch_id", null),
    ]);
    return { ...state, isAdmin: !!isAdmin, pending: pending ?? 0, usedToday: (jobsToday ?? 0) + (singles ?? 0) };
  });

/** Admin only: resume a paused queue after fixing keys or billing. */
export const resumeQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    await admin.from("system_state").update({ queue_paused: false, pause_reason: null, paused_at: null, updated_at: new Date().toISOString() }).eq("id", "main");
    return { ok: true };
  });
