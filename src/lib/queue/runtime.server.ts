import { Worker, DelayedError, UnrecoverableError } from "bullmq";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ScanError } from "../google-places.server";
import { recordError } from "../scan-core.server";
import { processWorkerStage, dispatchWorkerTasks } from "./pipeline.server";
import {
  queueNames,
  queueConnection,
  queueRedis,
  configureQueues,
  retryDelay,
  deadLetterQueue,
  saveDeadLetter,
  type WorkerStage,
  type WorkerPayload,
} from "./config.server";

export const expectedWorkers = [
  "scanner-worker-1",
  "scanner-worker-2",
  "analyzer-worker-1",
  "analyzer-worker-2",
  "analyzer-worker-3",
  "legal-worker-1",
  "legal-worker-2",
];
export async function startWorker(stage: WorkerStage) {
  if (process.env["MULTI_WORKER_ENABLED"] !== "true")
    throw new Error("Multi-worker deployment flag is not enabled.");
  await configureQueues();
  const name = `${stage}-worker-${Number(process.env["NODE_APP_INSTANCE"] ?? 0) + 1}`;
  let active = 0,
    dispatching = false,
    checking = false;
  const redis = queueRedis();
  const dlq = deadLetterQueue();
  const heartbeat = async () => {
    await redis.set(
      `rg:health:${name}`,
      JSON.stringify({
        name,
        stage,
        state: active ? "active" : "idle",
        pid: process.pid,
        checked_at: new Date().toISOString(),
      }),
      "EX",
      90,
    );
  };
  const worker = new Worker<WorkerPayload>(
    queueNames[stage],
    async (job, token) => {
      const started = Date.now();
      active++;
      try {
        await heartbeat();
        const result = await processWorkerStage(stage, job.data);
        if (result === "paused") {
          await job.moveToDelayed(Date.now() + 30000, token);
          throw new DelayedError();
        }
        await supabaseAdmin
          .from("worker_logs")
          .insert({
            worker_name: name,
            queue_name: queueNames[stage],
            job_id: job.id ?? null,
            status: result === "complete" ? "complete" : result,
            duration_ms: Date.now() - started,
            payload: job.data,
          })
          .throwOnError();
        return result;
      } catch (error) {
        if (error instanceof DelayedError) throw error;
        const message = error instanceof Error ? error.message : "Unknown worker failure";
        const task = (
          await supabaseAdmin
            .from("worker_tasks")
            .select("*")
            .eq("id", job.data.taskId)
            .single()
            .throwOnError()
        ).data;
        if (
          task.stage !== stage ||
          task.generation !== job.data.generation ||
          task.status === "complete"
        ) {
          console.error(
            "[worker-handoff] Durable stage advanced; dispatcher will recover downstream delivery.",
            message,
          );
          throw error;
        }
        await supabaseAdmin
          .from("worker_logs")
          .insert({
            worker_name: name,
            queue_name: queueNames[stage],
            job_id: job.id ?? null,
            status: "error",
            duration_ms: Date.now() - started,
            error: message.slice(0, 1000),
            payload: job.data,
          })
          .throwOnError();
        await recordError(supabaseAdmin, task.user_id, {
          code: error instanceof ScanError ? error.code : "WORKER_ERROR",
          message,
          scanId: task.scan_id,
          route: queueNames[stage],
        });
        if (error instanceof ScanError && error.code === "AI_BUDGET_LIMIT") {
          const tomorrow = new Date();
          tomorrow.setUTCHours(24, 0, 1, 0);
          await supabaseAdmin
            .from("worker_tasks")
            .update({ status: "queued", error: message, updated_at: new Date().toISOString() })
            .eq("id", task.id)
            .throwOnError();
          await supabaseAdmin
            .from("scans")
            .update({ status: "running", stage: "queued", error: message, completed_at: null })
            .eq("id", task.scan_id)
            .throwOnError();
          await job.moveToDelayed(tomorrow.getTime(), token);
          throw new DelayedError();
        }
        const permanent =
          error instanceof ScanError &&
          ["AI_AUTH", "AI_QUOTA", "INVALID_URL", "AMBIGUOUS_BUSINESS", "NO_REVIEWS"].includes(
            error.code,
          );
        if (permanent || job.attemptsMade + 1 >= 3) {
          await supabaseAdmin
            .from("worker_tasks")
            .update({
              status: "failed",
              attempts: job.attemptsMade + 1,
              error: message,
              updated_at: new Date().toISOString(),
            })
            .eq("id", task.id)
            .throwOnError();
          await supabaseAdmin
            .from("scans")
            .update({ status: "failed", error: message, completed_at: new Date().toISOString() })
            .eq("id", task.scan_id)
            .throwOnError();
          if (task.bulk_job_id)
            await supabaseAdmin
              .from("scan_jobs")
              .update({ status: "failed", error: message, locked_until: null })
              .eq("id", task.bulk_job_id)
              .throwOnError();
          await saveDeadLetter(stage, job.data);
          throw new UnrecoverableError(message);
        }
        await supabaseAdmin
          .from("worker_tasks")
          .update({
            attempts: job.attemptsMade + 1,
            error: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", task.id)
          .throwOnError();
        throw error;
      } finally {
        active--;
        await heartbeat();
      }
    },
    {
      connection: queueConnection(),
      concurrency: 1,
      lockDuration: 300000,
      settings: { backoffStrategy: retryDelay },
    },
  );
  worker.on("error", (error) => console.error(`[${name}]`, error.message));
  worker.on("failed", (job, error) => console.error(`[${name}] failed`, job?.id, error.message));
  await worker.waitUntilReady();
  await heartbeat();
  const heartbeatTimer = setInterval(() => {
    heartbeat().catch((error) => {
      console.error("[heartbeat]", error);
      process.exitCode = 1;
      void shutdown();
    });
  }, 30000);
  const dispatchTimer =
    stage === "scanner"
      ? setInterval(() => {
          if (dispatching) return;
          dispatching = true;
          dispatchWorkerTasks()
            .catch((error) => console.error("[dispatcher]", error))
            .finally(() => {
              dispatching = false;
            });
        }, 5000)
      : null;
  const healthTimer =
    stage === "scanner" && name.endsWith("-1")
      ? setInterval(async () => {
          if (checking) return;
          checking = true;
          try {
            const health = await redis.mget(expectedWorkers.map((worker) => `rg:health:${worker}`));
            const missing = expectedWorkers.filter((_, index) => !health[index]);
            await supabaseAdmin
              .from("worker_logs")
              .insert({
                worker_name: name,
                queue_name: "health-check",
                status: missing.length ? "unhealthy" : "healthy",
                error: missing.length ? `Missing heartbeat: ${missing.join(", ")}` : null,
              })
              .throwOnError();
            if (missing.length)
              console.error("[worker-health] Missing heartbeats", missing.join(", "));
            await configureQueues();
          } catch (error) {
            console.error("[worker-health]", error);
          } finally {
            checking = false;
          }
        }, 300000)
      : null;
  async function shutdown() {
    clearInterval(heartbeatTimer);
    if (dispatchTimer) clearInterval(dispatchTimer);
    if (healthTimer) clearInterval(healthTimer);
    await worker.close();
    await redis.del(`rg:health:${name}`);
    await dlq.close();
    await redis.quit();
    process.exit(process.exitCode ?? 0);
  }
  process.once("SIGTERM", () => {
    void shutdown();
  });
  process.once("SIGINT", () => {
    void shutdown();
  });
  console.info(`[${name}] ready; cluster stage concurrency enforced; heartbeat every 30s`);
}
