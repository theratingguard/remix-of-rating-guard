import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Scan, Report, AnalyzedReview } from "./data";
import puppeteer from "puppeteer";

export const MAX_REPORT_PDF_BYTES = 24 * 1024 * 1024;
const reportIdSchema = z.string().uuid();

export async function saveReportToVPS(reportId: string, pdfBuffer: Buffer) {
  reportIdSchema.parse(reportId);
  if (
    pdfBuffer.length === 0 ||
    pdfBuffer.length > MAX_REPORT_PDF_BYTES ||
    !pdfBuffer.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
    !pdfBuffer.subarray(-1024).includes(Buffer.from("%%EOF"))
  )
    throw new Error("Invalid PDF or report exceeds the 24 MB export limit.");
  const document = await PDFDocument.load(new Uint8Array(pdfBuffer), { updateMetadata: false });
  if (document.getPageCount() < 1 || document.getPageCount() > 100)
    throw new Error("A report PDF must contain between 1 and 100 pages.");

  const directory = process.env["REPORT_PDF_DIRECTORY"] || "/opt/rating-guard/public/reports";
  await mkdir(directory, { recursive: true, mode: 0o755 });
  const temporary = join(directory, `.${reportId}-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, pdfBuffer, { flag: "wx", mode: 0o600 });
    await chmod(temporary, 0o644);
    await rename(temporary, join(directory, `${reportId}.pdf`));
  } finally {
    await rm(temporary, { force: true });
  }
  return `https://ratingguard.online/reports/${reportId}.pdf`;
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "Not available").replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

export function reportPdfHtml(scan: Scan, report: Report, reviews: AnalyzedReview[]) {
  const analyzed = reviews.filter((review) => review.analysis).length;
  const flagged = reviews.filter(
    (review) => review.analysis?.risk === "high" || review.analysis?.risk === "medium",
  ).length;
  const unresolved = reviews.filter(
    (review) => !review.analysis || review.analysis.risk === "requires_review",
  ).length;
  const recommended =
    flagged === 0 && unresolved > 0
      ? "Manually assess the unresolved reviews. No clean-result conclusion or reporting recommendation is available until they are reviewed."
      : report.recommended_action;
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(report.report_number)}</title>
<style>
@page { size: A4; } body { color:#13243b; font:12px Arial, sans-serif; line-height:1.6; }
h1 { font-size:25px; } h2 { font-size:17px; margin-top:24px; border-bottom:1px solid #ccd4df; }
.label { color:#526276; } .review { border:1px solid #ccd4df; padding:14px; margin:14px 0; break-inside:avoid; }
.text { white-space:pre-wrap; overflow-wrap:anywhere; } table { width:100%; border-collapse:collapse; }
td { padding:7px; border-bottom:1px solid #e1e5eb; } .note { font-size:10px; color:#526276; }
</style></head><body>
<p><b>RATING GUARD</b> &middot; Evidence Report &middot; ${escapeHtml(report.report_number)}</p>
<h1>Google Review Risk Report</h1><h2>${escapeHtml(scan.business_name)}</h2>
<table><tr><td>Business rating</td><td>${escapeHtml(scan.rating)}</td></tr>
<tr><td>Total Google reviews</td><td>${escapeHtml(scan.total_reviews)}</td></tr>
<tr><td>Scan date</td><td>${escapeHtml(scan.created_at)}</td></tr>
<tr><td>Google Maps</td><td class="text">${escapeHtml(scan.maps_uri || scan.source_url)}</td></tr></table>
<h2>Summary</h2><p>Reviews retrieved: ${reviews.length} &middot; Analyzed: ${analyzed}
&middot; High risk: ${scan.high_count} &middot; Medium risk: ${scan.medium_count}
&middot; Normal: ${scan.normal_count} &middot; Requires review: ${unresolved}</p>
<p class="note">Source: Google Places API (New). The official API provides up to 5 reviews per business, not all reviews.</p>
<h2>Review details and AI assessments</h2>
${reviews
  .map(
    (review) => `<section class="review">
<b>${escapeHtml(review.author)}</b> &middot; ${review.rating}/5 &middot; ${escapeHtml(review.analysis?.risk ?? "requires_review")}
<p>${escapeHtml(review.published_at || review.relative_time)}</p>
<p class="text">${escapeHtml(review.text)}</p>
<p>Policy category: ${escapeHtml(review.analysis?.category)} &middot; Confidence: ${escapeHtml(review.analysis?.confidence)}%</p>
<p class="text">Reason: ${escapeHtml(review.analysis?.reason)}</p>
<p class="text">Evidence: ${escapeHtml(review.analysis?.evidence)}</p>
<p class="text">Review link: ${escapeHtml(review.review_uri)}</p></section>`,
  )
  .join("")}
<h2>Recommended action</h2><p class="text">${escapeHtml(recommended)}</p>
<h2>Google reporting instructions</h2>
<p>Open the business in Google Maps, select the relevant review and use Google's reporting tools when supported by evidence.</p>
<p>https://support.google.com/business/answer/4596773</p>
<p class="note">This report has not been submitted to Google. Classification is automated and advisory, not proof of a policy violation. Google independently determines whether removal is appropriate.</p>
</body></html>`;
}

let rendering = false;
export async function renderReportPdf(html: string) {
  if (rendering) throw new Error("Another report PDF is generating. Please retry shortly.");
  rendering = true;
  try {
    const browser = await puppeteer.launch({
      headless: true,
      timeout: 30000,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        void request.abort();
      });
      await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30000 });
      return Buffer.from(
        await page.pdf({
          format: "A4",
          printBackground: true,
          timeout: 30000,
          margin: { top: "15mm", right: "12mm", bottom: "18mm", left: "12mm" },
          displayHeaderFooter: true,
          headerTemplate: "<span></span>",
          footerTemplate:
            '<div style="font:9px Arial;width:100%;text-align:center;color:#526276">Rating Guard &middot; Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
        }),
      );
    } finally {
      await browser.close();
    }
  } finally {
    rendering = false;
  }
}

export async function generateOwnedReportPdf(
  supabase: SupabaseClient<Database>,
  userId: string,
  scanId: string,
) {
  reportIdSchema.parse(scanId);
  const [scan, report] = await Promise.all([
    supabase.from("scans").select("*").eq("id", scanId).eq("user_id", userId).maybeSingle(),
    supabase.from("reports").select("*").eq("scan_id", scanId).eq("user_id", userId).maybeSingle(),
  ]);
  if (scan.error || report.error) throw new Error("Could not verify report ownership.");
  if (!scan.data || !report.data || scan.data.status !== "complete" || scan.data.is_seed)
    throw new Error("Only your completed, saved live reports can be published as PDFs.");

  const reviewRows = await supabase
    .from("reviews")
    .select(
      "id, author, rating, published_at, relative_time, text, review_uri, review_analyses!review_analyses_review_id_fkey(risk, category, signals, reason, evidence, confidence, model)",
    )
    .eq("scan_id", scanId);
  if (reviewRows.error) throw new Error("Could not load report reviews for PDF generation.");
  const reviews: AnalyzedReview[] = reviewRows.data.map(({ review_analyses, ...review }) => {
    const analysis = Array.isArray(review_analyses) ? review_analyses[0] : review_analyses;
    const risk = analysis?.risk;
    return {
      ...review,
      analysis: analysis
        ? {
            ...analysis,
            risk:
              risk === "high" || risk === "medium" || risk === "normal" ? risk : "requires_review",
          }
        : null,
    };
  });
  const pdfBuffer = await renderReportPdf(reportPdfHtml(scan.data, report.data, reviews));
  const url = await saveReportToVPS(scanId, pdfBuffer);
  const metadata = report.data.report_data;
  const updated = await supabase
    .from("reports")
    .update({
      report_data: {
        ...(metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {}),
        pdf_url: url,
        pdf_saved_at: new Date().toISOString(),
      },
    })
    .eq("id", report.data.id)
    .eq("user_id", userId)
    .select("id")
    .single();
  if (updated.error || !updated.data)
    throw new Error(
      "PDF was saved on the VPS, but its report URL could not be saved to the database.",
    );
  return { url };
}
