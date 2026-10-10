import { describe, it, expect, vi, afterEach } from "vitest";
const fixture = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: fixture }));
vi.mock("./scan-core.server", () => ({ scanFetchCore: vi.fn(), scanAnalyzeCore: vi.fn() }));
import { runWorker, CONCURRENCY } from "./queue.server";
afterEach(() => vi.clearAllMocks());
describe("Rate-limited durable worker", () => {
  it("uses one worker concurrency to avoid concurrent Chromium rendering", () =>
    expect(CONCURRENCY).toBe(1));
  it("does not claim any jobs while the global queue is paused", async () => {
    fixture.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => ({
            throwOnError: async () => ({ data: { queue_paused: true, pause_reason: "fixture" } }),
          }),
        }),
      }),
    });
    expect(await runWorker()).toMatchObject({ ran: false, processed: 0 });
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
});
