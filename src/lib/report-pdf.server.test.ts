import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  MAX_REPORT_PDF_BYTES,
  generateOwnedReportPdf,
  saveReportToVPS,
  renderReportPdf,
  legalAnalysisHtml,
} from "./report-pdf.server";
import { LEGAL_DISCLAIMER, LEGAL_VERSION, unsupportedLegalReview } from "./legal-analysis";
import type { AnalyzedReview } from "./data";
import puppeteer from "puppeteer";
vi.mock("./settings.server", async () => {
  const { defaultSettings } = await import("./settings");
  return { getSettings: async () => defaultSettings };
});

const browserMock = vi.hoisted(() => ({
  pdf: vi.fn(),
  close: vi.fn(),
  setContent: vi.fn(),
  javascript: vi.fn(),
  interception: vi.fn(),
  on: vi.fn(),
}));
vi.mock("puppeteer", () => ({
  default: {
    launch: vi.fn(async () => ({
      newPage: async () => ({
        pdf: browserMock.pdf,
        setContent: browserMock.setContent,
        setJavaScriptEnabled: browserMock.javascript,
        setRequestInterception: browserMock.interception,
        on: browserMock.on,
      }),
      close: browserMock.close,
    })),
  },
}));

const scanId = "9c401517-d96f-498b-82d2-65b6d9b30e96";
let directory: string;
let pdf: Buffer;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "ratingguard-pdf-test-"));
  vi.stubEnv("REPORT_PDF_DIRECTORY", directory);
  const document = await PDFDocument.create();
  document.addPage();
  pdf = Buffer.from(await document.save());
  vi.clearAllMocks();
  browserMock.pdf.mockResolvedValue(pdf);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

function database(options: { owner?: boolean; status?: string; updateFailure?: boolean } = {}) {
  const writes: unknown[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname.endsWith("/removal_outcomes")) return Response.json([]);
    if (url.pathname.endsWith("/reviews")) {
      expect(url.searchParams.get("scan_id")).toBe(`eq.${scanId}`);
      return Response.json([
        {
          id: "b8c10010-0e10-487f-a50f-61c8cb1276d4",
          author: "<script>attack</script>",
          rating: 1,
          text: "Unit review",
          review_analyses: [{ risk: "requires_review", confidence: 0 }],
        },
      ]);
    }
    expect(url.searchParams.get("user_id")).toBe("eq.owner");
    if (init?.method === "PATCH") {
      writes.push(JSON.parse(String(init.body)));
      return options.updateFailure
        ? Response.json({ message: "Unit database failure" }, { status: 500 })
        : Response.json([{ id: "report-fixture" }]);
    }
    if (options.owner === false) return Response.json([]);
    return Response.json(
      url.pathname.endsWith("/scans")
        ? [
            {
              id: scanId,
              status: options.status ?? "complete",
              is_seed: false,
              business_name: "Unit fixture",
              high_count: 0,
              medium_count: 0,
              normal_count: 0,
            },
          ]
        : [
            {
              id: "report-fixture",
              report_number: "RPT-FIXTURE",
              recommended_action: "No reporting action recommended.",
              report_data: { business: "Unit fixture" },
            },
          ],
    );
  };
  return {
    client: createClient<Database>("https://unit-fixture.invalid", "sb_publishable_fixture", {
      global: { fetch },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    writes,
  };
}

describe("VPS PDF persistence", () => {
  it("escapes legal evidence, displays advisory scores and includes supported draft text", () => {
    const review: AnalyzedReview = {
      id: scanId,
      author: "<script>author</script>",
      rating: 1,
      text: "Unit evidence",
      review_uri: null,
      published_at: null,
      relative_time: null,
      analysis: null,
    };
    const html = legalAnalysisHtml(
      {
        version: LEGAL_VERSION,
        generated_at: new Date().toISOString(),
        model: "unit",
        disclaimer: LEGAL_DISCLAIMER,
        reviews: [
          {
            ...unsupportedLegalReview(review),
            violates_policy: true,
            removal_likelihood: 60,
            evidence_quote: "<script>evidence</script>",
            removal_request_text: "Unit formal draft",
          },
        ],
      },
      [review],
    );
    expect(html).toContain("Legal Expert Analysis");
    expect(html).toContain("60% (uncalibrated AI estimate");
    expect(html).toContain("Unit formal draft");
    expect(html).toContain("&lt;script&gt;evidence&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("stores valid bytes atomically, with a UUID filename and private filesystem permissions", async () => {
    expect(await saveReportToVPS(scanId, pdf)).toBe(
      `https://ratingguard.online/reports/${scanId}.pdf`,
    );
    expect(await readFile(join(directory, `${scanId}.pdf`))).toEqual(pdf);
    expect(await readdir(directory)).toEqual([`${scanId}.pdf`]);
    if (process.platform !== "win32")
      expect((await stat(join(directory, `${scanId}.pdf`))).mode & 0o777).toBe(0o600);
  });
  it("rejects traversal and malformed PDF bytes without writing files", async () => {
    await expect(saveReportToVPS("../escape", pdf)).rejects.toThrow();
    await expect(saveReportToVPS(scanId, Buffer.from("%PDF-fake\n%%EOF"))).rejects.toThrow();
    expect(await readdir(directory)).toEqual([]);
  });
  it("rejects oversized files before parsing or writing", async () => {
    await expect(saveReportToVPS(scanId, Buffer.alloc(MAX_REPORT_PDF_BYTES + 1))).rejects.toThrow(
      "24 MB",
    );
    expect(await readdir(directory)).toEqual([]);
  });
  it("preserves report metadata and persists its PDF URL only for the owner", async () => {
    const db = database();
    const result = await generateOwnedReportPdf(db.client, "owner", scanId);
    expect(db.writes).toEqual([
      {
        report_data: {
          business: "Unit fixture",
          pdf_url: result.url,
          pdf_saved_at: expect.any(String),
          pdf_status: "ready",
          report_url: result.url,
          legal_pdf_url: result.legalUrl,
          legal_pdf_saved_at: expect.any(String),
          legal_analysis: expect.objectContaining({
            version: "legal-v1",
            reviews: expect.arrayContaining([
              expect.objectContaining({ violates_policy: false, removal_likelihood: 0 }),
            ]),
          }),
        },
      },
    ]);
    expect(browserMock.javascript).toHaveBeenCalledWith(false);
    expect(browserMock.interception).toHaveBeenCalledWith(true);
    expect(browserMock.close).toHaveBeenCalledTimes(2);
    const html = browserMock.setContent.mock.calls[0]?.[0];
    expect(html).toContain("&lt;script&gt;attack&lt;/script&gt;");
    expect(html).toContain("No clean-result conclusion");
    expect(html).not.toContain("No reporting action recommended.");
    expect(html).toContain("Legal Expert Analysis");
    expect(html).toContain("Not estimable");
    expect(await readdir(join(directory, "shared"))).toEqual([
      `${scanId}.pdf`,
      `${scanId}_legal.pdf`,
    ]);
  });
  it.each([{ owner: false }, { status: "failed" }, { status: "running" }])(
    "does not publish unauthorized or incomplete reports: %j",
    async (options) => {
      const db = database(options);
      await expect(generateOwnedReportPdf(db.client, "owner", scanId)).rejects.toThrow("completed");
      expect(db.writes).toEqual([]);
      expect(await readdir(directory)).toEqual([]);
      expect(puppeteer.launch).not.toHaveBeenCalled();
    },
  );
  it("surfaces metadata persistence failure instead of reporting export success", async () => {
    const db = database({ updateFailure: true });
    await expect(generateOwnedReportPdf(db.client, "owner", scanId)).rejects.toThrow(
      "URL could not be saved",
    );
  });
  it("closes Chromium and resets admission after PDF render failure", async () => {
    browserMock.pdf.mockRejectedValueOnce(new Error("Unit render failure"));
    await expect(renderReportPdf("<p>Fixture</p>")).rejects.toThrow("Unit render failure");
    expect(browserMock.close).toHaveBeenCalledOnce();
    expect(await renderReportPdf("<p>Retry</p>")).toEqual(pdf);
  });
});
