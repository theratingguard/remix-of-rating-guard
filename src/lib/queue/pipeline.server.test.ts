import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
const state = vi.hoisted(() => ({
  db: null as SupabaseClient<Database> | null,
  scanner: vi.fn(),
  analyzer: vi.fn(),
  legal: vi.fn(),
  next: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    if (!state.db) throw Error("Fixture database missing");
    return state.db;
  },
}));
vi.mock("../scan-core.server", () => ({
  scanFetchCore: state.scanner,
  scanAnalyzeCore: state.analyzer,
  scanFinalizeCore: state.legal,
  validGoogleUrl: (url: string) => url.startsWith("https://www.google.com/maps"),
  track: vi.fn(),
}));
vi.mock("../settings.server", () => ({ getSettings: async () => ({ bulk_scan_enabled: true }) }));
vi.mock("./config.server", async () => {
  const { z } = await import("zod");
  return {
    payloadSchema: z.object({ taskId: z.string().uuid(), generation: z.number() }),
    stageSchema: z.enum(["scanner", "analyzer", "legal"]),
    workerQueues: () => ({
      scanner: { add: state.next },
      analyzer: { add: state.next },
      legal: { add: state.next },
    }),
    queueRedis: vi.fn(),
  };
});
import { processWorkerStage } from "./pipeline.server";
const taskId = "11111111-1111-4111-8111-111111111111",
  scanId = "22222222-2222-4222-8222-222222222222";
function fixture(stage: string, batchStatus?: string) {
  const writes: { table: string; body: Record<string, unknown> }[] = [];
  state.db = createClient<Database>("https://unit.invalid", "unit", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const table = new URL(input instanceof Request ? input.url : input.toString()).pathname
          .split("/")
          .at(-1)!;
        if ((init?.method ?? "GET") === "GET") {
          const row =
            table === "worker_tasks"
              ? {
                  id: taskId,
                  scan_id: scanId,
                  user_id: "owner",
                  stage,
                  status: "queued",
                  generation: 0,
                  batch_id: batchStatus ? "batch" : null,
                  bulk_job_id: null,
                }
              : table === "scan_batches"
                ? { control_status: batchStatus }
                : table === "system_state"
                  ? { queue_paused: false }
                  : {
                      source_url: "https://www.google.com/maps?cid=1",
                      status: "running",
                      stage: "queued",
                      reviews_retrieved: stage === "scanner" ? 0 : 5,
                    };
          return Response.json(row);
        }
        writes.push({ table, body: JSON.parse(String(init?.body)) });
        return new Response(null, { status: 204 });
      },
    },
  });
  return writes;
}
beforeEach(() => {
  for (const fn of [state.scanner, state.analyzer, state.legal])
    fn.mockResolvedValue({ ok: true, scanId, reviews: 5 });
});
afterEach(() => vi.clearAllMocks());
describe("Isolated durable worker stages", () => {
  it("scanner saves Google data and hands off only to analyzer", async () => {
    const writes = fixture("scanner");
    expect(await processWorkerStage("scanner", { taskId, generation: 0 })).toBe("complete");
    expect(state.scanner).toHaveBeenCalledWith(
      state.db,
      "owner",
      expect.objectContaining({ queuedScanId: scanId }),
    );
    expect(state.analyzer).not.toHaveBeenCalled();
    expect(state.legal).not.toHaveBeenCalled();
    expect(writes.at(-1)?.body).toMatchObject({ stage: "analyzer", status: "queued" });
    expect(state.next).toHaveBeenCalledWith("analyzer", expect.anything(), expect.anything());
  });
  it("analyzer calculates assessments without rendering PDF, then queues legal", async () => {
    const writes = fixture("analyzer");
    expect(await processWorkerStage("analyzer", { taskId, generation: 0 })).toBe("complete");
    expect(state.analyzer).toHaveBeenCalledWith(state.db, "owner", { scanId, deferLegal: true });
    expect(state.legal).not.toHaveBeenCalled();
    expect(writes.at(-1)?.body).toMatchObject({ stage: "legal", status: "queued" });
  });
  it("legal saves PDFs and completes the durable task without another handoff", async () => {
    const writes = fixture("legal");
    expect(await processWorkerStage("legal", { taskId, generation: 0 })).toBe("complete");
    expect(state.legal).toHaveBeenCalledWith(state.db, "owner", { scanId });
    expect(writes.at(-1)?.body).toMatchObject({ stage: "done", status: "complete" });
    expect(state.next).not.toHaveBeenCalled();
  });
  it("paused batches start no stage and cancelled batches are not published", async () => {
    fixture("scanner", "paused");
    expect(await processWorkerStage("scanner", { taskId, generation: 0 })).toBe("paused");
    expect(state.scanner).not.toHaveBeenCalled();
    fixture("legal", "cancelled");
    expect(await processWorkerStage("legal", { taskId, generation: 0 })).toBe("cancelled");
    expect(state.legal).not.toHaveBeenCalled();
  });
  it("a failed scanner never queues an analyzer job", async () => {
    fixture("scanner");
    state.scanner.mockResolvedValue({
      ok: false,
      code: "RESOLVE_FAILED",
      message: "Exact fixture failure",
    });
    await expect(processWorkerStage("scanner", { taskId, generation: 0 })).rejects.toMatchObject({
      code: "RESOLVE_FAILED",
    });
    expect(state.next).not.toHaveBeenCalled();
  });
  it("stale generations cannot re-execute a stage", async () => {
    fixture("scanner");
    expect(await processWorkerStage("scanner", { taskId, generation: 1 })).toBe("obsolete");
    expect(state.scanner).not.toHaveBeenCalled();
  });
});
