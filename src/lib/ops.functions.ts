// Tracking, Action Center, Quality Center, Error Center and System Quality reads/writes.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ACTION_STATUSES } from "./actions";

const day = (iso: string) => iso.slice(0, 10);

export const getOperations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: scans }, { data: errors }, { data: events }] = await Promise.all([
      supabase.from("scans").select("id, business_name, source_url, rating, reviews_retrieved, high_count, medium_count, normal_count, requires_review_count, status, stage, error, is_seed, rating_mismatch, reviews_failed_analysis, data_quality, started_at, created_at, completed_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("error_events").select("module, code").limit(1000),
      supabase.from("scan_events").select("scan_id, stage, created_at").order("created_at", { ascending: false }).limit(500),
    ]);
    const list = scans ?? [];
    const latest = new Map<string, string>();
    for (const e of events ?? []) if (!latest.has(e.scan_id)) latest.set(e.scan_id, e.stage);
    const { count: analyzed } = await supabase.from("review_analyses").select("id", { head: true, count: "exact" });
    const sum = (k: "reviews_retrieved" | "high_count" | "medium_count" | "normal_count") => list.reduce((s, x) => s + (x[k] ?? 0), 0);
    return {
      kpi: {
        total: list.length,
        running: list.filter((s) => s.status === "running").length,
        completed: list.filter((s) => s.status === "complete").length,
        partial: list.filter((s) => s.status === "failed" && s.reviews_retrieved > 0).length,
        failed: list.filter((s) => s.status === "failed" && s.reviews_retrieved === 0).length,
        reviewsRetrieved: sum("reviews_retrieved"), reviewsAnalyzed: analyzed ?? 0,
        high: sum("high_count"), medium: sum("medium_count"), normal: sum("normal_count"),
        ratingMismatches: list.filter((s) => s.rating_mismatch).length,
        apiFailures: (errors ?? []).filter((e) => e.module === "google").length,
        aiFailures: (errors ?? []).filter((e) => e.module === "ai").length,
      },
      activity: list.slice(0, 15).map((s) => ({
        ...s,
        currentStage: s.is_seed ? "DEVELOPMENT_DATA" : latest.get(s.id) ?? (s.status === "complete" ? "REPORT_READY" : s.stage ?? "CREATED"),
        durationMs: s.completed_at ? new Date(s.completed_at).getTime() - new Date(s.started_at ?? s.created_at).getTime() : s.status === "running" ? Date.now() - new Date(s.started_at ?? s.created_at).getTime() : null,
      })),
    };
  });

export const getScanEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ scanId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase.from("scan_events").select("stage, status, message, duration_ms, error_code, created_at").eq("scan_id", data.scanId).order("created_at");
    return rows ?? [];
  });

export const getActionCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: an } = await supabase.from("review_analyses").select("review_id, scan_id, risk, category, reason, evidence, confidence, signals, verification").in("risk", ["high", "medium"]).order("created_at", { ascending: false }).limit(300);
    const rows = an ?? [];
    if (!rows.length) return [];
    const ids = rows.map((r) => r.review_id);
    const scanIds = [...new Set(rows.map((r) => r.scan_id))];
    const [{ data: reviews }, { data: scans }, { data: actions }] = await Promise.all([
      supabase.from("reviews").select("id, author, rating, text, review_uri").in("id", ids),
      supabase.from("scans").select("id, business_name, rating, is_seed, user_id").in("id", scanIds),
      supabase.from("review_actions").select("review_id, status, note, updated_at").in("review_id", ids),
    ]);
    const rv = new Map((reviews ?? []).map((r) => [r.id, r]));
    const sc = new Map((scans ?? []).map((s) => [s.id, s]));
    const ac = new Map((actions ?? []).map((a) => [a.review_id, a]));
    return rows.map((a) => {
      const r = rv.get(a.review_id); const s = sc.get(a.scan_id); const act = ac.get(a.review_id);
      return {
        reviewId: a.review_id, scanId: a.scan_id, business: s?.business_name ?? "—", businessRating: s?.rating ?? null, isSeed: !!s?.is_seed,
        editable: s?.user_id === userId, reviewer: r?.author ?? "—", reviewRating: r?.rating ?? null, text: r?.text ?? "",
        reviewUrl: r?.review_uri ?? null, risk: a.risk, category: a.category, reason: a.reason, evidence: a.evidence,
        confidence: a.confidence, signals: a.signals, verification: a.verification,
        status: act?.status ?? "NOT_REVIEWED", note: act?.note ?? null, updatedAt: act?.updated_at ?? null,
      };
    });
  });

export const setActionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ reviewId: z.string().uuid(), scanId: z.string().uuid(), status: z.enum(ACTION_STATUSES), note: z.string().max(1000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("review_actions").upsert({
      review_id: data.reviewId, scan_id: data.scanId, user_id: userId, status: data.status, note: data.note ?? null, updated_at: new Date().toISOString(),
    }, { onConflict: "review_id" });
    if (error) throw new Error("Could not save the action status. Development data cannot be changed.");
    await supabase.from("audit_log").insert({ user_id: userId, action: "action.status_changed", resource: "review", resource_id: data.reviewId, detail: { status: data.status } });
    return { ok: true };
  });

export const getQualityCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: scans }, { data: errors }, { count: reports }, { data: an }, { data: actions }, { data: revs }] = await Promise.all([
      supabase.from("scans").select("id, business_id, business_name, rating, status, high_count, medium_count, normal_count, requires_review_count, reviews_retrieved, rating_mismatch, data_quality, data_quality_reasons, review_health_score, is_seed, created_at").order("created_at"),
      supabase.from("error_events").select("module, code, created_at"),
      supabase.from("reports").select("id", { head: true, count: "exact" }),
      supabase.from("review_analyses").select("risk"),
      supabase.from("review_actions").select("status"),
      supabase.from("reviews").select("review_uri, scan_id"),
    ]);
    const list = scans ?? [];
    const flaggedCount = (an ?? []).filter((a) => a.risk === "high" || a.risk === "medium").length;
    const notActionable = (actions ?? []).filter((a) => a.status === "NOT_ACTIONABLE").length;
    const trend = new Map<string, { date: string; scans: number; high: number; ratingSum: number; ratingN: number; failures: number }>();
    for (const s of list) {
      const k = day(s.created_at);
      const t = trend.get(k) ?? { date: k, scans: 0, high: 0, ratingSum: 0, ratingN: 0, failures: 0 };
      t.scans++; t.high += s.high_count;
      if (s.rating != null) { t.ratingSum += Number(s.rating); t.ratingN++; }
      if (s.status === "failed") t.failures++;
      trend.set(k, t);
    }
    return {
      kpi: {
        businesses: new Set(list.map((s) => s.business_id ?? s.business_name)).size,
        reviewsRetrieved: list.reduce((a, s) => a + s.reviews_retrieved, 0),
        reviewsAnalyzed: (an ?? []).length,
        high: (an ?? []).filter((a) => a.risk === "high").length,
        medium: (an ?? []).filter((a) => a.risk === "medium").length,
        normal: (an ?? []).filter((a) => a.risk === "normal").length,
        policyRisk: flaggedCount,
        actionable: flaggedCount - notActionable,
        notActionable,
        reports: reports ?? 0,
        googleLinks: (revs ?? []).filter((r) => r.review_uri).length,
        apiFailures: (errors ?? []).filter((e) => e.module === "google").length,
        analysisFailures: (errors ?? []).filter((e) => e.module === "ai").length,
        mismatches: list.filter((s) => s.rating_mismatch).length,
      },
      trend: [...trend.values()].map((t) => ({ date: t.date, scans: t.scans, high: t.high, failures: t.failures, avgRating: t.ratingN ? +(t.ratingSum / t.ratingN).toFixed(2) : null })),
      businesses: list.filter((s) => s.status === "complete").map((s) => ({ id: s.id, name: s.business_name, rating: s.rating, health: s.review_health_score, quality: s.data_quality, reasons: s.data_quality_reasons, isSeed: s.is_seed })),
    };
  });

export const getErrorCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("error_events").select("*").order("created_at", { ascending: false }).limit(200);
    return data ?? [];
  });

export const setErrorStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), status: z.enum(["OPEN", "INVESTIGATING", "FIXED", "VERIFIED"]), resolution: z.string().max(1000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("error_events").update({ status: data.status, resolution: data.resolution ?? null }).eq("id", data.id);
    if (error) throw new Error("Could not update the error.");
    return { ok: true };
  });

export const getSystemQuality = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: findings }, { data: scans }, { data: reviews }, { count: reports }] = await Promise.all([
      supabase.from("debug_findings").select("*").order("finding_code"),
      supabase.from("scans").select("status, is_seed").eq("is_seed", false),
      supabase.from("reviews").select("processing_status"),
      supabase.from("reports").select("id", { head: true, count: "exact" }).eq("is_seed", false),
    ]);
    const f = findings ?? [];
    const live = scans ?? [];
    const done = live.filter((s) => s.status === "complete").length;
    const failed = live.filter((s) => s.status === "failed").length;
    const rv = reviews ?? [];
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
    return {
      findings: f,
      counts: {
        open: f.filter((x) => x.status === "OPEN" || x.status === "FIXING").length,
        blocked: f.filter((x) => x.status === "BLOCKED").length,
        critical: f.filter((x) => x.severity === "CRITICAL" && x.status !== "VERIFIED").length,
        high: f.filter((x) => x.severity === "HIGH" && x.status !== "VERIFIED").length,
        medium: f.filter((x) => x.severity === "MEDIUM" && x.status !== "VERIFIED").length,
        verified: f.filter((x) => x.status === "VERIFIED").length,
      },
      rates: {
        scanSuccess: pct(done, live.length), scanFailure: pct(failed, live.length),
        reviewProcessing: pct(rv.filter((r) => r.processing_status === "ANALYZED").length, rv.length),
        reportSuccess: pct(reports ?? 0, done),
        liveScans: live.length,
      },
    };
  });
