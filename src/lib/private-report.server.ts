import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MAX_REPORT_PDF_BYTES } from "./report-pdf.server";
import { savedPdfUrl } from "./data";
import { savedLegalPdfUrl } from "./legal-analysis";
import { selectedPdfUrl } from "./review-selection";

export const privatePdfInput = z.object({
  scanId: z.string().uuid(),
  variant: z.enum(["full", "legal", "selected"]),
});

export async function readPrivateReportPdf(
  supabase: SupabaseClient<Database>,
  input: z.infer<typeof privatePdfInput>,
) {
  privatePdfInput.parse(input);
  const report = await supabase
    .from("reports")
    .select("report_data,report_number")
    .eq("scan_id", input.scanId)
    .maybeSingle()
    .throwOnError();
  if (!report.data) throw new Error("Access Denied: report is private or unavailable.");
  const url =
    input.variant === "full"
      ? savedPdfUrl(report.data.report_data)
      : input.variant === "legal"
        ? savedLegalPdfUrl(report.data.report_data)
        : selectedPdfUrl(report.data.report_data);
  if (!url) throw new Error("PDF is unavailable or expired. Regenerate it from the report page.");
  const filename = basename(new URL(url).pathname);
  if (input.variant === "selected") {
    const artifactId = z
      .string()
      .uuid()
      .parse(filename.replace(/_selected\.pdf$/, ""));
    const allowed = await supabase
      .rpc("can_download_selected_artifact", {
        _artifact_id: artifactId,
        _scan_id: input.scanId,
      })
      .throwOnError();
    if (!allowed.data)
      throw new Error("Access Denied: selected snapshot must be regenerated for private access.");
  } else if (filename !== `${input.scanId}${input.variant === "legal" ? "_legal" : ""}.pdf`) {
    throw new Error("Access Denied: PDF does not belong to this report.");
  }
  const buffer = await readFile(
    join(process.env["REPORT_PDF_DIRECTORY"] || "/opt/rating-guard-private/reports", filename),
  );
  if (buffer.length > MAX_REPORT_PDF_BYTES || !buffer.subarray(0, 5).equals(Buffer.from("%PDF-")))
    throw new Error("Saved PDF is invalid.");
  await PDFDocument.load(new Uint8Array(buffer));
  return {
    base64: buffer.toString("base64"),
    filename: `${report.data.report_number}-${input.variant}.pdf`,
  };
}
