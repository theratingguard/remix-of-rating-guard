import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { concurrency, queueRedis, workerQueues, stageSchema } from "./config.server";

const statsSchema = z.object({
  total: z.number(),
  failed: z.number(),
  completed: z.number(),
  average_ms: z.number().nullable(),
  reserved_usd: z.number().nullable(),
});
const heartbeatSchema = z.object({
  name: z.string(),
  stage: stageSchema,
  state: z.enum(["active", "idle"]),
  pid: z.number(),
  checked_at: z.string().datetime(),
});
export async function readWorkerStatus() {
  if (process.env["MULTI_WORKER_ENABLED"] !== "true")
    throw new Error("Multi-worker system has not been enabled.");
  const redis = queueRedis();
  if ((await redis.ping()) !== "PONG") throw new Error("Redis unavailable.");
  const names = stageSchema.options.flatMap((stage) =>
    Array.from({ length: concurrency[stage] }, (_, i) => `${stage}-worker-${i + 1}`),
  );
  const [heartbeats, rawStats, info, queueStats] = await Promise.all([
    redis.mget(names.map((name) => `rg:health:${name}`)),
    supabaseAdmin.rpc("worker_daily_stats").throwOnError(),
    redis.info("memory"),
    Promise.all(
      stageSchema.options.map(async (stage) => ({
        stage,
        concurrency: concurrency[stage],
        counts: await workerQueues()[stage].getJobCounts(
          "waiting",
          "active",
          "delayed",
          "failed",
          "completed",
        ),
      })),
    ),
  ]);
  const memory = /^used_memory:(\d+)/m.exec(info)?.[1];
  if (!memory) throw new Error("Redis memory diagnostics are unavailable.");
  return {
    redis: "PONG",
    checked_at: new Date().toISOString(),
    memory_bytes: Number(memory),
    workers: names.map((name, i) => {
      const value = heartbeats[i];
      if (!value) return { name, state: "unhealthy" as const, checked_at: null };
      const heartbeat = heartbeatSchema.parse(JSON.parse(value));
      return {
        ...heartbeat,
        state:
          Date.now() - Date.parse(heartbeat.checked_at) > 90000
            ? ("unhealthy" as const)
            : heartbeat.state,
      };
    }),
    stats: statsSchema.parse(rawStats.data),
    queues: queueStats,
    budget_limit_usd: 10,
    db_request_limit: 20,
  };
}
