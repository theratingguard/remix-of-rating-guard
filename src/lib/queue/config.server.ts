import { Queue, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";

export const stageSchema = z.enum(["scanner", "analyzer", "legal"]);
export type WorkerStage = z.infer<typeof stageSchema>;
export const queueNames = {
  scanner: "scanner-queue",
  analyzer: "analyzer-queue",
  legal: "legal-queue",
} as const;
export const concurrency = { scanner: 2, analyzer: 3, legal: 2 } as const;
export const payloadSchema = z
  .object({ taskId: z.string().uuid(), generation: z.number().int().nonnegative() })
  .strict();
export type WorkerPayload = z.infer<typeof payloadSchema>;
export const jobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "ratingguard" },
  removeOnComplete: 100,
  removeOnFail: 500,
};
// Three total attempts mean two retry waits. 30s is available if a fourth attempt is ever explicitly enabled.
export const retryDelay = (attempt: number) =>
  [1000, 5000, 30000][Math.min(2, Math.max(0, attempt - 1))]!;

let redis: Redis | undefined;
let queues: Record<WorkerStage, Queue<WorkerPayload>> | undefined;
let deadLetters: Queue<WorkerPayload> | undefined;
export function deadLetterQueue() {
  if (!deadLetters) {
    deadLetters = new Queue<WorkerPayload>("dead-letter-queue", {
      connection: { ...queueConnection(), maxRetriesPerRequest: 2, commandTimeout: 5000 },
    });
    deadLetters.on("error", (error) => console.error("[dlq]", error.message));
  }
  return deadLetters;
}
export async function saveDeadLetter(stage: WorkerStage, data: WorkerPayload) {
  const queue = deadLetterQueue();
  await queue.add(stage, data, { jobId: `${data.taskId}-${stage}-${data.generation}` });
  const excess = await queue.getJobs(["waiting"], 500, 599);
  for (const job of excess) await job.remove();
}
export function queueConnection() {
  const url = new URL(process.env["REDIS_URL"] ?? "redis://127.0.0.1:6379");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.protocol !== "redis:")
    throw new Error("Worker Redis must be bound to local loopback.");
  return {
    host: url.hostname === "localhost" ? "127.0.0.1" : url.hostname,
    port: Number(url.port || 6379),
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };
}
export function queueRedis() {
  if (!redis) {
    redis = new Redis({ ...queueConnection(), maxRetriesPerRequest: 2, commandTimeout: 5000 });
    redis.on("error", (error) => console.error("[redis]", error.message));
  }
  return redis;
}
export function workerQueues() {
  if (!queues) {
    const create = (stage: WorkerStage) => {
      const queue = new Queue<WorkerPayload>(queueNames[stage], {
        connection: { ...queueConnection(), maxRetriesPerRequest: 2, commandTimeout: 5000 },
        defaultJobOptions: jobOptions,
      });
      queue.on("error", (error) => console.error(`[${queue.name}]`, error.message));
      return queue;
    };
    queues = { scanner: create("scanner"), analyzer: create("analyzer"), legal: create("legal") };
  }
  return queues;
}
export async function configureQueues() {
  for (const stage of stageSchema.options)
    await workerQueues()[stage].setGlobalConcurrency(concurrency[stage]);
  // Global limiter is shared by both scanner instances, not multiplied by process count.
  const { getSettings } = await import("../settings.server");
  const settings = await getSettings();
  await workerQueues().scanner.setGlobalRateLimit(
    1,
    Math.ceil(60000 / Math.min(10, settings.rate_limit_per_min)),
  );
}
