import { afterEach, describe, expect, it, vi } from "vitest";
import { scanAnalyzeCore } from "./scan-core.server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import { analyzeReview as analyzeReviewByLayer } from "./ai-orchestrator.server";
import { generateOwnedReportPdf } from "./report-pdf.server";
vi.mock("./settings.server", async () => {
  const { defaultSettings } = await import("./settings");
  return { getSettings: async () => ({ ...defaultSettings, multi_model_enabled: false }) };
});
vi.mock("./report-pdf.server", () => ({
  generateOwnedReportPdf: vi.fn(async () => ({ url: "https://unit-fixture.invalid/report.pdf" })),
}));

vi.mock("./analysis.server", () => ({
  enforceEvidence: (value: unknown) => value,
  verifyFlags: vi.fn(async () => []),
  reviewHash: vi.fn(),
  ANALYSIS_MODEL: "unit-model",
  AI_PROVIDER: "unit-provider",
  PROMPT_VERSION: "unit-version",
  THREE_MODEL_MODE: false,
}));
vi.mock("./ai-orchestrator.server", () => ({
  analyzeReview: vi.fn(async () => ({
    violates: false,
    policy: "none",
    confidence: 70,
    evidence: "",
    source: "gpt",
    consensus: {
      model: "unit-model",
      provider: "unit-provider",
      agrees: false,
      risk: "normal",
      reason: "Unit fixture",
      checked_at: new Date().toISOString(),
      votes: [],
    },
  })),
}));

function database(failure?: "report" | "completion", scanStatus = "running") {
  const updates: Record<string, unknown>[] = [];
  const reportWrites: Record<string, unknown>[] = [];
  const analysisWrites: Record<string, unknown>[] = [];
  const evidenceWrites: Record<string, unknown>[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const table = url.pathname.split("/").at(-1);
    const method = init?.method ?? "GET";
    if (method === "GET") {
      if (table === "scans") {
        const row = {
          id: "scan-fixture",
          user_id: "owner",
          status: scanStatus,
          stage: "analyze",
          rating: 4,
          reviews_retrieved: 1,
          business_name: "Unit fixture",
          high_count: 0,
          medium_count: 0,
          normal_count: 0,
          requires_review_count: 0,
          ...Object.assign({}, ...updates),
        };
        return Response.json(
          new Headers(init?.headers).get("accept")?.includes("vnd.pgrst.object") ? row : [row],
        );
      }
      if (table === "reports") return Response.json([{ id: "report-fixture" }]);
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
    const rows =
      typeof init?.body === "string"
        ? z.array(z.record(z.string(), z.unknown())).safeParse(JSON.parse(init.body))
        : null;
    const status = patch?.success ? patch.data["status"] : null;
    if (table === "scans" && patch?.success) updates.push(patch.data);
    if (table === "reports" && patch?.success) reportWrites.push(patch.data);
    if (table === "review_evidence" && patch?.success) evidenceWrites.push(patch.data);
    if (table === "review_analyses") {
      if (rows?.success) analysisWrites.push(...rows.data);
      else if (patch?.success) analysisWrites.push(patch.data);
    }
    if (
      (table === "reports" && failure === "report") ||
      (table === "scans" && status === "complete" && failure === "completion")
    ) {
      return Response.json(
        { code: "UNIT_ERROR", message: "Injected write failure" },
        { status: 500 },
      );
    }
    if (table === "review_evidence" && patch?.success)
      return Response.json({ id: "evidence-fixture", ...patch.data });
    if (table === "scans" && status === "running") return Response.json([{ id: "scan-fixture" }]);
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
  return { client, updates, reportWrites, analysisWrites, evidenceWrites };
}

describe("Durable scan completion (unit fixtures only)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(generateOwnedReportPdf).mockClear();
  });
  it("fails the scan explicitly when automatic PDF persistence fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-key");
    vi.mocked(generateOwnedReportPdf).mockRejectedValueOnce(new Error("Unit PDF save failure"));
    const db = database();
    const result = await scanAnalyzeCore(db.client, "owner", { scanId: "scan-fixture" });
    expect(result.ok).toBe(false);
    expect(db.updates.some((update) => update["status"] === "complete")).toBe(false);
    expect(db.updates).toContainEqual({
      high_count: 0,
      medium_count: 0,
      normal_count: 1,
      requires_review_count: 0,
      reviews_failed_analysis: 0,
    });
  });
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
    vi.mocked(analyzeReviewByLayer).mockResolvedValueOnce({
      violates: false,
      policy: "none",
      confidence: 70,
      evidence: "",
      source: "rules",
      micro_score: {
        score: 12,
        band: "normal",
        checksRun: 500,
        checksAssessed: 32,
        checksFlagged: 3,
        durationMs: 4,
        groups: {
          text: { score: 5, maxScore: 30, checks: 100, assessed: 20, flagged: 2 },
          reviewer: { score: 1, maxScore: 25, checks: 75, assessed: 3, flagged: 1 },
          temporal: { score: 0, maxScore: 15, checks: 50, assessed: 2, flagged: 0 },
          crossPlatform: { score: 0, maxScore: 15, checks: 75, assessed: 1, flagged: 0 },
          network: { score: 5, maxScore: 10, checks: 50, assessed: 1, flagged: 0 },
          semantic: { score: 1, maxScore: 5, checks: 50, assessed: 5, flagged: 0 },
          pattern: { score: 0, maxScore: 0, checks: 50, assessed: 0, flagged: 0 },
          language: { score: 0, maxScore: 0, checks: 50, assessed: 0, flagged: 0 },
        },
      },
      micro_checks: [],
    });
    const db = database();
    expect(await scanAnalyzeCore(db.client, "owner", { scanId: "scan-fixture" })).toMatchObject({
      ok: true,
    });
    expect(analyzeReviewByLayer).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Unit fixture", rating: 4 }),
      { usageContext: { scanId: "scan-fixture", reviewId: "review-fixture" } },
    );
    expect(db.updates.at(-1)).toMatchObject({ status: "complete", error: null });
    expect(db.analysisWrites[0]?.["verification"]).toMatchObject({
      rules_micro_check: {
        score: 12,
        checksRun: 500,
        checksAssessed: 32,
      },
    });
  });
  it("persists a Places evidence snapshot when analysis flags a review", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
    vi.mocked(analyzeReviewByLayer).mockResolvedValueOnce({
      violates: true,
      policy: "spam",
      confidence: 90,
      evidence: "Unit fixture",
      source: "rules",
    });
    const db = database();
    expect(await scanAnalyzeCore(db.client, "owner", { scanId: "scan-fixture" })).toMatchObject({
      ok: true,
    });
    expect(db.evidenceWrites).toHaveLength(1);
    expect(db.evidenceWrites[0]).toMatchObject({
      review_id: "review-fixture",
      screenshot_url: null,
      metadata: {
        source: "google_places",
        screenshot: { status: "unavailable" },
      },
    });
  });
  it("re-enters the running analysis lifecycle before publishing a failed scan retry", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
    const db = database(undefined, "failed");
    expect(await scanAnalyzeCore(db.client, "owner", { scanId: "scan-fixture" })).toMatchObject({
      ok: true,
    });
    expect(db.updates[0]).toMatchObject({
      status: "running",
      stage: "analyze",
      error: null,
      completed_at: null,
    });
    expect(db.updates.at(-1)).toMatchObject({ status: "complete" });
  });
  it("does not recommend a clean result when model assessments require manual review", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
    vi.mocked(analyzeReviewByLayer).mockResolvedValueOnce({
      violates: false,
      policy: "none",
      confidence: 50,
      evidence: "",
      source: "gpt",
    });
    const db = database();
    expect(await scanAnalyzeCore(db.client, "owner", { scanId: "scan-fixture" })).toMatchObject({
      ok: true,
    });
    expect(db.reportWrites[0]?.["recommended_action"]).toContain("require manual assessment");
    expect(db.updates.at(-1)?.["requires_review_count"]).toBe(1);
  });
  it("leaves the scan incomplete and does not generate PDFs in the analyzer-only stage", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
    const db = database();
    expect(
      await scanAnalyzeCore(db.client, "owner", {
        scanId: "scan-fixture",
        deferLegal: true,
      }),
    ).toMatchObject({ ok: true, queued: true });
    expect(generateOwnedReportPdf).not.toHaveBeenCalled();
    expect(db.updates.some((update) => update["status"] === "complete")).toBe(false);
  });
});
