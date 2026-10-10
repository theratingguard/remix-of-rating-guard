import { afterEach, describe, expect, it, vi } from "vitest";
import { scanAnalyzeCore } from "./scan-core.server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import { analyzeReviews } from "./analysis.server";

vi.mock("./analysis.server", () => ({
  analyzeReviews: vi.fn(async () => [
    {
      risk: "normal",
      category: null,
      signals: [],
      reason: "Unit fixture",
      evidence: null,
      confidence: 70,
    },
  ]),
  enforceEvidence: (value: unknown) => value,
  verifyFlags: vi.fn(async () => []),
  reviewHash: vi.fn(),
  ANALYSIS_MODEL: "unit-model",
  AI_PROVIDER: "unit-provider",
  PROMPT_VERSION: "unit-version",
}));

function database(failure?: "report" | "completion") {
  const updates: Record<string, unknown>[] = [];
  const reportWrites: Record<string, unknown>[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const table = url.pathname.split("/").at(-1);
    const method = init?.method ?? "GET";
    if (method === "GET") {
      if (table === "scans")
        return Response.json([
          {
            id: "scan-fixture",
            user_id: "owner",
            status: "running",
            stage: "analyze",
            rating: 4,
            reviews_retrieved: 1,
            business_name: "Unit fixture",
          },
        ]);
      if (table === "reviews")
        return Response.json([
          {
            id: "review-fixture",
            rating: 4,
            text: "Unit fixture",
            content_hash: "fixture",
            review_uri: null,
          },
        ]);
      return Response.json([]);
    }
    const patch =
      typeof init?.body === "string"
        ? z.record(z.unknown()).safeParse(JSON.parse(init.body))
        : null;
    const status = patch?.success ? patch.data["status"] : null;
    if (table === "scans" && patch?.success) updates.push(patch.data);
    if (table === "reports" && patch?.success) reportWrites.push(patch.data);
    if (
      (table === "reports" && failure === "report") ||
      (table === "scans" && status === "complete" && failure === "completion")
    ) {
      return Response.json(
        { code: "UNIT_ERROR", message: "Injected write failure" },
        { status: 500 },
      );
    }
    return new Response(null, { status: 204 });
  };
  const client = createClient<Database>(
    "https://unit-fixture.invalid",
    "sb_publishable_unit_fixture",
    {
      global: { fetch },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return { client, updates, reportWrites };
}

describe("Durable scan completion (unit fixtures only)", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("does not mark complete or return success when report persistence fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
    const db = database("report");
    expect(await scanAnalyzeCore(db.client, "owner", { scanId: "scan-fixture" })).toMatchObject({
      ok: false,
      code: "REPORT_ERROR",
    });
    expect(db.updates.some((patch) => patch["status"] === "complete")).toBe(false);
    expect(db.updates.at(-1)?.["status"]).toBe("failed");
  });
  it("returns failure if completion state cannot be persisted", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
    const db = database("completion");
    expect(await scanAnalyzeCore(db.client, "owner", { scanId: "scan-fixture" })).toMatchObject({
      ok: false,
      code: "DB_UNAVAILABLE",
    });
    expect(db.updates.at(-1)?.["status"]).toBe("failed");
  });
  it("returns success only after mandatory writes succeed", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
    const db = database();
    expect(await scanAnalyzeCore(db.client, "owner", { scanId: "scan-fixture" })).toMatchObject({
      ok: true,
    });
    expect(db.updates.at(-1)).toMatchObject({ status: "complete", error: null });
  });
  it("does not recommend a clean result when model assessments require manual review", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
    vi.mocked(analyzeReviews).mockResolvedValueOnce([
      {
        risk: "requires_review",
        category: null,
        signals: [],
        reason: "Ambiguous unit fixture",
        evidence: null,
        confidence: 50,
      },
    ]);
    const db = database();
    expect(await scanAnalyzeCore(db.client, "owner", { scanId: "scan-fixture" })).toMatchObject({
      ok: true,
    });
    expect(db.reportWrites[0]?.["recommended_action"]).toContain("require manual assessment");
    expect(db.updates.at(-1)?.["requires_review_count"]).toBe(1);
  });
});
