import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  scanFetchCore,
  scanAnalyzeCore,
  scanFinalizeCore,
  validGoogleUrl,
  track,
  type StageResponse,
} from "../scan-core.server";
import { searchBusinesses, ScanError } from "../google-places.server";
import { getSettings } from "../settings.server";
import {
  payloadSchema,
  stageSchema,
  workerQueues,
  queueRedis,
  saveDeadLetter,
  type WorkerStage,
  type WorkerPayload,
} from "./config.server";

export async function submitWorkerScan(
  db: SupabaseClient<Database>,
  userId: string,
  url: string,
): Promise<StageResponse> {
  if (!validGoogleUrl(url))
    return { ok: false, code: "INVALID_URL", message: "Use an official Google Maps business URL." };
  try {
    if ((await db.rpc("report_access_level").throwOnError()).data !== "super_admin")
      throw new Error("Access Denied: detailed scan queue is Super Admin only.");
    if ((await queueRedis().ping()) !== "PONG") throw new Error("Redis did not respond.");
    const id = (await db.rpc("enqueue_worker_scan", { _url: url }).throwOnError()).data;
    await track(
      db,
      userId,
      id,
      "QUEUED",
      Date.now(),
      "Durable worker task saved; awaiting scanner.",
    );
    // PostgreSQL task is the durable outbox. Redis availability after this point
    // cannot lose the request; the dispatcher delivers it with a deterministic ID.
    return { ok: true, queued: true, scanId: id, reviews: 0 };
  } catch (error) {
    console.error("[worker-submit]", error instanceof Error ? error.message : error);
    return {
      ok: false,
      code: "QUEUE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "Worker queue admission failed.",
    };
  }
}

export async function dispatchWorkerTasks() {
  const redis = queueRedis(),
    token = randomUUID();
  if (!(await redis.set("rg:dispatch-lock", token, "PX", 30000, "NX"))) return;
  try {
    // New queue owns all execution when enabled. The old timer must be disabled
    // before cutover; this claims only explicitly running bulk batches.
    const jobs = (await supabaseAdmin.rpc("claim_scan_jobs", { _limit: 1 }).throwOnError()).data;
    for (const job of jobs ?? []) {
      await supabaseAdmin.rpc("ensure_bulk_worker_task", { _job_id: job.id }).throwOnError();
    }
    const rows = (
      await supabaseAdmin
        .from("worker_tasks")
        .select("*")
        .in("status", ["queued", "processing"])
        .order("updated_at")
        .limit(5000)
        .throwOnError()
    ).data;
    for (const row of rows) {
      const stage = stageSchema.parse(row.stage);
      const id = `${row.id}-${stage}-${row.generation}`;
      const existing = await workerQueues()[stage].getJob(id);
      if (existing && (await existing.getState()) === "failed") {
        const message = existing.failedReason || "Worker stalled or exhausted its attempts.";
        await saveDeadLetter(stage, { taskId: row.id, generation: row.generation });
        await supabaseAdmin
          .from("worker_tasks")
          .update({ status: "failed", error: message, updated_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("generation", row.generation)
          .throwOnError();
        await supabaseAdmin
          .from("scans")
          .update({ status: "failed", error: message, completed_at: new Date().toISOString() })
          .eq("id", row.scan_id)
          .throwOnError();
        if (row.bulk_job_id)
          await supabaseAdmin
            .from("scan_jobs")
            .update({ status: "failed", error: message, locked_until: null })
            .eq("id", row.bulk_job_id)
            .throwOnError();
        const { recordError } = await import("../scan-core.server");
        await recordError(supabaseAdmin, row.user_id, {
          code: "WORKER_STALLED",
          message,
          scanId: row.scan_id,
        });
        continue;
      }
      await workerQueues()[stage].add(
        stage,
        { taskId: row.id, generation: row.generation },
        {
          jobId: id,
        },
      );
    }
    await supabaseAdmin
      .from("system_state")
      .update({ last_worker_run: new Date().toISOString() })
      .eq("id", "main")
      .throwOnError();
  } finally {
    await redis.eval(
      "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",
      1,
      "rg:dispatch-lock",
      token,
    );
  }
}

export async function processWorkerStage(stage: WorkerStage, raw: WorkerPayload) {
  const payload = payloadSchema.parse(raw),
    db = supabaseAdmin;
  const task = (
    await db.from("worker_tasks").select("*").eq("id", payload.taskId).single().throwOnError()
  ).data;
  if (
    task.stage !== stage ||
    task.generation !== payload.generation ||
    ["complete", "failed", "cancelled"].includes(task.status)
  )
    return "obsolete";
  if (task.batch_id) {
    if (!(await getSettings()).bulk_scan_enabled) return "paused";
    const batch = (
      await db
        .from("scan_batches")
        .select("control_status")
        .eq("id", task.batch_id)
        .single()
        .throwOnError()
    ).data;
    const state = (
      await db.from("system_state").select("queue_paused").eq("id", "main").single().throwOnError()
    ).data;
    if (batch.control_status === "cancelled") {
      await db
        .from("worker_tasks")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", task.id)
        .throwOnError();
      await db
        .from("scans")
        .update({
          status: "failed",
          error: "Bulk batch cancelled.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", task.scan_id)
        .throwOnError();
      if (task.bulk_job_id)
        await db
          .from("scan_jobs")
          .update({ status: "cancelled", error: "Bulk batch cancelled.", locked_until: null })
          .eq("id", task.bulk_job_id)
          .throwOnError();
      return "cancelled";
    }
    if (batch.control_status === "paused" || state.queue_paused) return "paused";
  }
  const scan = (
    await db
      .from("scans")
      .select("source_url,status,stage,reviews_retrieved")
      .eq("id", task.scan_id)
      .eq("user_id", task.user_id)
      .single()
      .throwOnError()
  ).data;
  if (
    scan.status !== "complete" &&
    !(stage === "scanner" && scan.stage === "analyze" && scan.reviews_retrieved > 0)
  )
    await db
      .from("scans")
      .update({
        status: "running",
        stage: stage === "scanner" ? "fetch" : stage === "legal" ? "legal" : "analyze",
        error: null,
        completed_at: null,
        started_at: new Date().toISOString(),
      })
      .eq("id", task.scan_id)
      .throwOnError();
  await db
    .from("worker_tasks")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", task.id)
    .throwOnError();
  let result: StageResponse;
  if (stage === "scanner") {
    if (scan.reviews_retrieved > 0 && scan.stage === "analyze") {
      result = { ok: true, scanId: task.scan_id, reviews: scan.reviews_retrieved };
    } else {
      let url = scan.source_url;
      if (!validGoogleUrl(url)) {
        const candidates = await searchBusinesses(process.env["GOOGLE_PLACES_API_KEY"] ?? "", url);
        if (candidates.length !== 1)
          throw new ScanError(
            "AMBIGUOUS_BUSINESS",
            "An exact Google Maps URL is required; name search did not return one unique match.",
          );
        url = candidates[0]!.url;
      }
      result = await scanFetchCore(db, task.user_id, {
        url,
        queuedScanId: task.scan_id,
        ...(task.batch_id ? { batchId: task.batch_id } : {}),
      });
    }
  } else if (stage === "analyzer") {
    result = await scanAnalyzeCore(db, task.user_id, { scanId: task.scan_id, deferLegal: true });
  } else {
    result = await scanFinalizeCore(db, task.user_id, { scanId: task.scan_id });
  }
  if (!result.ok) throw new ScanError(result.code, result.message);
  const next = stage === "scanner" ? "analyzer" : stage === "analyzer" ? "legal" : "done";
  await db
    .from("worker_tasks")
    .update({
      stage: next,
      status: next === "done" ? "complete" : "queued",
      error: null,
      attempts: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", task.id)
    .eq("generation", payload.generation)
    .throwOnError();
  if (next === "done" && task.bulk_job_id)
    await db
      .from("scan_jobs")
      .update({
        status: "completed",
        error: null,
        locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.bulk_job_id)
      .throwOnError();
  if (next !== "done")
    await workerQueues()[next].add(next, payload, {
      jobId: `${task.id}-${next}-${payload.generation}`,
    });
  return "complete";
}

export async function retryWorkerTask(scanId: string, userId: string) {
  const db = supabaseAdmin;
  const task = (
    await db
      .from("worker_tasks")
      .select("*")
      .eq("scan_id", scanId)
      .eq("user_id", userId)
      .maybeSingle()
      .throwOnError()
  ).data;
  if (!task) throw new Error("Saved worker task not found.");
  if (task.status !== "failed")
    throw new Error("Only terminal failed worker tasks can be retried.");
  await db
    .from("worker_tasks")
    .update({
      status: "queued",
      error: null,
      generation: task.generation + 1,
      attempts: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", task.id)
    .eq("generation", task.generation)
    .throwOnError();
  await db
    .from("scans")
    .update({ status: "running", stage: "queued", error: null, completed_at: null })
    .eq("id", scanId)
    .throwOnError();
  return { scanId, message: "Saved task queued for background retry." };
}
