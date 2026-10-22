import { describe, it, expect, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
const fixture = vi.hoisted(() => ({
  context: {} as { supabase: ReturnType<typeof createClient<Database>>; userId: string },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware() {
      return this;
    },
    validator() {
      return this;
    },
    handler(fn: (input: { context: typeof fixture.context; data: unknown }) => Promise<unknown>) {
      return (options: { data: unknown }) => fn({ context: fixture.context, data: options.data });
    },
  }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("./settings.server", () => ({ requireFeature: vi.fn() }));
import { getBatchJobs } from "./queue.functions";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
describe("Large durable batch result pagination", () => {
  it("returns exactly 1,001 jobs and their fetched metrics/report URLs beyond REST's default limit", async () => {
    const jobs = Array.from({ length: 1001 }, (_, position) => ({
      id: id(position),
      url: `Business ${position} City`,
      position,
      status: "completed",
      attempts: 1,
      error: null,
      scan_id: id(position + 10000),
      next_run_at: "2026-01-01T00:00:00Z",
    }));
    const ranges: string[] = [];
    fixture.context = {
      userId: "owner",
      supabase: createClient<Database>("https://queue-fixture.invalid", "sb_publishable_fixture", {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: async (input, init) => {
            const url = new URL(String(input)),
              table = url.pathname.split("/").at(-1);
            if (table === "scan_batches") return Response.json({ control_status: "paused" });
            if (table === "system_state")
              return Response.json({ queue_paused: false, pause_reason: null });
            if (table === "scan_jobs") {
              const start = Number(url.searchParams.get("offset") ?? 0),
                limit = Number(url.searchParams.get("limit") ?? 500);
              ranges.push(`${start}:${limit}`);
              expect(new Headers(init?.headers).get("range") ?? "unused").not.toBe("0-999");
              return Response.json(jobs.slice(start, start + limit));
            }
            const ids = (url.searchParams.get("id") ?? url.searchParams.get("scan_id") ?? "")
              .replace(/^in\.\(|\)$/g, "")
              .split(",");
            expect(ids.length).toBeLessThanOrEqual(100);
            if (table === "scans")
              return Response.json(
                ids.map((id) => ({
                  id,
                  business_name: "Fixture",
                  rating: 4,
                  total_reviews: 20,
                  reviews_retrieved: 5,
                  high_count: 0,
                  medium_count: 0,
                })),
              );
            if (table === "reviews")
              return Response.json(
                ids.flatMap((scan_id) => [1, 2, 3, 4, 5].map((rating) => ({ scan_id, rating }))),
              );
            if (table === "reports")
              return Response.json(ids.map((scan_id) => ({ scan_id, report_data: {} })));
            throw new Error(`Unexpected fixture table ${table}`);
          },
        },
      }),
    };
    const result = await getBatchJobs({ data: { batchId: id(999999) } });
    expect(result.jobs).toHaveLength(1001);
    expect(ranges).toEqual(["0:500", "500:500", "1000:500"]);
    expect(result.jobs.at(-1)).toMatchObject({
      position: 1000,
      stars: [1, 1, 1, 1, 1],
      reportUrl: `https://ratingguard.online/reports/${id(11000)}`,
    });
    expect(result.controlStatus).toBe("paused");
  });
});
