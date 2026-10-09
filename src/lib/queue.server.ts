// Background bulk-scan queue. Runs on the server only, using the privileged client
// (jobs belong to many users; each job's own user_id is used for every row it writes).
import { scanFetchCore, scanAnalyzeCore } from "./scan-core.server";

/** Errors that mean the whole queue must stop until an admin fixes keys/billing. */
export const PAUSE_CODES = new Set(["AI_QUOTA", "AI_AUTH", "API_UNAVAILABLE", "GOOGLE_API_NOT_CONFIGURED"]);
/** Transient errors that are retried with backoff. */
export const RETRY_CODES = new Set(["RATE_LIMIT", "NETWORK", "GOOGLE_ERROR", "AI_UNAVAILABLE", "DB_UNAVAILABLE", "RESOLVE_FAILED", "UNKNOWN", "SCAN_IN_PROGRESS"]);
export const MAX_ATTEMPTS = 3;
export const BATCH_PER_RUN = 6;
export const CONCURRENCY = 2;

export function backoffMs(attempts: number) {
  return Math.min(10 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1)) + Math.floor(Math.random() * 5000);
}

/** Decide what happens to a job after a failed stage. */
export function nextStep(code: string, attempts: number): "pause" | "retry" | "fail" {
  if (PAUSE_CODES.has(code)) return "pause";
  if (RETRY_CODES.has(code) && attempts < MAX_ATTEMPTS) return "retry";
  return "fail";
}

export async function pauseQueue(admin: any, reason: string) {
  await admin.from("system_state").update({ queue_paused: true, pause_reason: reason, paused_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", "main");
}

async function runJob(admin: any, job: any): Promise<"paused" | "done"> {
  const upd = (p: Record<string, unknown>) => admin.from("scan_jobs").update({ ...p, updated_at: new Date().toISOString() }).eq("id", job.id);
  const handle = async (r: { code: string; message: string; scanId?: string }, partial: boolean) => {
    const step = nextStep(r.code, job.attempts);
    if (step === "pause") {
      await pauseQueue(admin, r.message);
      await upd({ status: "pending", attempts: Math.max(0, job.attempts - 1), error: r.message, locked_until: null, scan_id: r.scanId ?? job.scan_id });
      return "paused" as const;
    }
    if (step === "retry") {
      await upd({ status: "pending", error: r.message, locked_until: null, next_run_at: new Date(Date.now() + backoffMs(job.attempts)).toISOString(), scan_id: r.scanId ?? job.scan_id });
      return "done" as const;
    }
    await upd({ status: partial ? "partial" : "failed", error: r.message, locked_until: null, scan_id: r.scanId ?? job.scan_id });
    return "done" as const;
  };

  let scanId: string | undefined = job.scan_id ?? undefined;
  // Re-use a scan whose Google stage already succeeded on an earlier attempt.
  if (scanId) {
    const { data: s } = await admin.from("scans").select("status, stage").eq("id", scanId).maybeSingle();
    if (!s || s.status === "failed" || s.stage === "fetch") scanId = undefined;
  }
  if (!scanId) {
    const a = await scanFetchCore(admin, job.user_id, { url: job.url, batchId: job.batch_id });
    if (!a.ok) return handle(a, false);
    scanId = a.scanId;
    await upd({ scan_id: scanId });
  }
  const b = await scanAnalyzeCore(admin, job.user_id, { scanId });
  if (!b.ok) {
    // Google data is saved; reset the scan so a retry can re-run analysis.
    if (nextStep(b.code, job.attempts) !== "fail") await admin.from("scans").update({ status: "running", stage: "analyze", error: null }).eq("id", scanId);
    return handle({ ...b, scanId }, true);
  }
  await upd({ status: "completed", error: null, locked_until: null, scan_id: scanId });
  return "done";
}

/** One bounded worker run: lock → claim a small batch → process with limited concurrency. */
export async function runWorker(opts: { deadlineMs?: number } = {}) {
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  const { data: state } = await admin.from("system_state").select("queue_paused, pause_reason").eq("id", "main").maybeSingle();
  if (state?.queue_paused) return { ran: false, reason: `paused: ${state.pause_reason ?? ""}`, processed: 0 };
  const { data: locked } = await admin.rpc("acquire_worker_lock", { _seconds: 90 });
  if (!locked) return { ran: false, reason: "another worker is running", processed: 0 };
  const deadline = Date.now() + (opts.deadlineMs ?? 45_000);
  let processed = 0;
  try {
    while (Date.now() < deadline) {
      const { data: jobs, error } = await admin.rpc("claim_scan_jobs", { _limit: BATCH_PER_RUN });
      if (error) throw new Error(error.message);
      if (!jobs?.length) break;
      let paused = false;
      let i = 0;
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
        while (i < jobs.length && !paused) {
          const job = jobs[i++]!;
          try { if ((await runJob(admin, job)) === "paused") paused = true; }
          catch (e) {
            console.error("job crashed", job.id, e);
            await admin.from("scan_jobs").update({ status: "pending", locked_until: null, error: "Unexpected error — will retry.", next_run_at: new Date(Date.now() + backoffMs(job.attempts)).toISOString() }).eq("id", job.id);
          }
          processed++;
        }
      }));
      // Release jobs claimed but not started because the queue paused.
      if (paused) {
        await admin.from("scan_jobs").update({ status: "pending", locked_until: null }).in("id", jobs.slice(i).map((j: any) => j.id));
        break;
      }
    }
  } finally {
    await admin.from("system_state").update({ worker_lock_until: null }).eq("id", "main");
  }
  return { ran: true, processed };
}
