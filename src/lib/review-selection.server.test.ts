import { describe, expect, it, vi, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createSelectedReport } from "./review-selection.server";
import { readOpenAIStream } from "./openai-stream.server";
import { renderReportPdf, saveReportToVPS } from "./report-pdf.server";
vi.mock("./openai-stream.server", () => ({ readOpenAIStream: vi.fn() }));
vi.mock("./settings.server", async () => {
  const { defaultSettings } = await import("./settings");
  return { requireFeature: async () => defaultSettings, getSettings: async () => defaultSettings };
});
vi.mock("./report-pdf.server", () => ({
  renderReportPdf: vi.fn(async () => Buffer.from("%PDF-fixture")),
  saveReportToVPS: vi.fn(
    async () =>
      "https://ratingguard.online/api/storage/download?folder=reports%2F00000000-0000-4000-8000-000000000003&filename=6736a5be-e460-4e01-bfed-839fcd714877_selected.pdf",
  ),
  escapeHtml: (value: unknown) => String(value),
  reportPdfHtml: (_scan: unknown, _report: unknown, reviews: { id: string }[]) =>
    `<body>${reviews.map((r) => r.id).join(",")}</body>`,
}));
const ids = ["b8c10010-0e10-487f-a50f-61c8cb1276d4", "0b9bfc89-9e0d-407e-b481-7561e8319198"];
const userId = "00000000-0000-4000-8000-000000000003";
function database(owner = true) {
  const writes: { table: string | undefined; value: unknown }[] = [];
  const client = createClient<Database>("https://unit-fixture.invalid", "sb_publishable_fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        const table = url.pathname.split("/").at(-1);
        if (init?.method === "POST" && table === "save_selected_report") {
          writes.push({ table, value: JSON.parse(String(init.body)) });
          return Response.json(true);
        }
        if (table === "scans") {
          expect(url.searchParams.get("user_id")).toBe(`eq.${userId}`);
          return Response.json(
            owner
              ? [
                  {
                    id: "6736a5be-e460-4e01-bfed-839fcd714877",
                    status: "complete",
                    is_seed: false,
                    business_name: "Unit business",
                  },
                ]
              : [],
          );
        }
        if (table === "reports")
          return Response.json(
            owner ? [{ id: "fixture", report_data: { pdf_url: "original" } }] : [],
          );
        if (table === "removal_history") return Response.json([]);
        if (table === "learning_snapshots") return Response.json([]);
        return Response.json(
          ids.map((id) => ({
            id,
            author: "Unit Reviewer",
            rating: 1,
            text: "Unit review",
            review_analyses: [{ risk: "requires_review", signals: [], confidence: 0 }],
          })),
        );
      },
    },
  });
  return { client, writes };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("Selected report generation", () => {
  it("generates exactly two selected assessments and a separate two-review PDF", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({})),
    );
    vi.mocked(readOpenAIStream).mockResolvedValue(
      JSON.stringify({
        requests: ids.map((review_id) => ({
          review_id,
          assessment: "insufficient_evidence",
          policy: "None",
          evidence: "",
          request_text: "Not sufficient",
          policy_reference: "https://support.google.com/contributionpolicy/answer/7400114",
        })),
      }),
    );
    const db = database();
    const result = await createSelectedReport(
      db.client,
      userId,
      "6736a5be-e460-4e01-bfed-839fcd714877",
      ids,
    );
    expect(result.selectedCount).toBe(2);
    expect(result.requests).toHaveLength(2);
    expect(renderReportPdf).toHaveBeenCalledWith(expect.stringContaining(ids.join(",")));
    expect(saveReportToVPS).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer),
      userId,
      "selected",
    );
    expect(db.writes.filter((write) => write.table === "save_selected_report")).toHaveLength(1);
    expect(JSON.stringify(db.writes)).toContain("selected_requests");
  });
  it("rejects an unowned scan before AI generation or persistence", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const db = database(false);
    await expect(
      createSelectedReport(db.client, userId, "6736a5be-e460-4e01-bfed-839fcd714877", ids),
    ).rejects.toThrow("Only your");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(db.writes).toEqual([]);
  });
  it("rejects a foreign selection ID before any AI or PDF call", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const db = database();
    await expect(
      createSelectedReport(db.client, userId, "6736a5be-e460-4e01-bfed-839fcd714877", [ids[0]!]),
    ).rejects.toThrow("do not belong");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(renderReportPdf).not.toHaveBeenCalled();
  });
  it("does not save flags or PDFs when AI generation fails", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 429 })),
    );
    const db = database();
    await expect(
      createSelectedReport(db.client, userId, "6736a5be-e460-4e01-bfed-839fcd714877", ids),
    ).rejects.toThrow("[429]");
    expect(db.writes).toEqual([]);
    expect(saveReportToVPS).not.toHaveBeenCalled();
  });
});
