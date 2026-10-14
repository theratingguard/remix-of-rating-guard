import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { readPrivateReportPdf } from "./private-report.server";
import { saveReportToVPS } from "./report-pdf.server";
vi.mock("./settings.server", async () => {
  const { defaultSettings } = await import("./settings");
  return { getSettings: async () => defaultSettings };
});

const scanId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";
let directory: string;
let pdf: Buffer;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "private-pdf-unit-"));
  vi.stubEnv("STORAGE_ROOT", directory);
  const document = await PDFDocument.create();
  document.addPage();
  pdf = Buffer.from(await document.save());
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
function client(options: { denied?: boolean; urlId?: string; selected?: boolean } = {}) {
  return createClient<Database>("https://private-unit.invalid", "sb_publishable_fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.pathname.includes("/rpc/")) return Response.json(options.selected ?? false);
        expect(url.searchParams.get("scan_id")).toBe(`eq.${scanId}`);
        return Response.json(
          options.denied
            ? []
            : [
                {
                  report_number: "RPT-UNIT",
                  report_data: {
                    pdf_url: `https://ratingguard.online/api/storage/download?folder=reports%2F${userId}&filename=${options.urlId ?? scanId}.pdf`,
                    pdf_saved_at: new Date().toISOString(),
                    selected_pdf_url: `https://ratingguard.online/api/storage/download?folder=reports%2F${userId}&filename=${otherId}_selected.pdf`,
                    selected_saved_at: new Date().toISOString(),
                  },
                },
              ],
        );
      },
    },
  });
}
describe("Private report PDF authorization", () => {
  it("returns bytes only after an RLS-visible report is loaded", async () => {
    await saveReportToVPS(scanId, pdf, userId);
    const result = await readPrivateReportPdf(client(), { scanId, variant: "full" }, userId);
    expect(Buffer.from(result.base64, "base64")).toEqual(
      await readFile(join(directory, "reports", userId, `${scanId}.pdf`)),
    );
  });
  it("denies another owner or a restricted principal before reading files", async () => {
    await expect(
      readPrivateReportPdf(client({ denied: true }), { scanId, variant: "full" }, userId),
    ).rejects.toThrow("Access Denied");
  });
  it("does not trust owner-editable metadata pointing to another report", async () => {
    await saveReportToVPS(otherId, pdf, userId);
    await expect(
      readPrivateReportPdf(client({ urlId: otherId }), { scanId, variant: "full" }, userId),
    ).rejects.toThrow("does not belong");
  });
  it("requires a server-registered ownership binding for selected snapshots", async () => {
    await saveReportToVPS(otherId, pdf, userId, "selected");
    await expect(
      readPrivateReportPdf(client(), { scanId, variant: "selected" }, userId),
    ).rejects.toThrow("Access Denied");
    const result = await readPrivateReportPdf(
      client({ selected: true }),
      {
        scanId,
        variant: "selected",
      },
      userId,
    );
    expect(Buffer.from(result.base64, "base64")).toEqual(pdf);
  });
  it("rejects path traversal and unsupported variants", async () => {
    await expect(
      readPrivateReportPdf(client(), { scanId: "../escape", variant: "full" }, userId),
    ).rejects.toThrow();
  });
});
