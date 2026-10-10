import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Scan, Report, AnalyzedReview } from "./data";
import puppeteer from "puppeteer";
import { generateLegalAnalysis } from "./analysis.server";
import { savedLegalAnalysis, type LegalAnalysis } from "./legal-analysis";
import { starBreakdown, removalBand, removalSummary } from "./review-metrics";

export const MAX_REPORT_PDF_BYTES = 24 * 1024 * 1024;
const reportIdSchema = z.string().uuid();

export async function saveReportToVPS(
  reportId: string,
  pdfBuffer: Buffer,
  subdirectory?: string,
  evidence: boolean | "selected" | "legal" = false,
) {
  reportIdSchema.parse(reportId);
  if (subdirectory && subdirectory !== "shared") reportIdSchema.parse(subdirectory);
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

  const root = process.env["REPORT_PDF_DIRECTORY"] || "/opt/rating-guard-private/reports";
  const directory = subdirectory ? join(root, subdirectory) : root;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = join(directory, `.${reportId}-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, pdfBuffer, { flag: "wx", mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(
      temporary,
      join(
        directory,
        `${reportId}${typeof evidence === "string" ? `_${evidence}` : evidence ? "_evidence" : ""}.pdf`,
      ),
    );
  } finally {
    await rm(temporary, { force: true });
  }
  return `https://ratingguard.online/reports/${subdirectory ? subdirectory + "/" : ""}${reportId}${typeof evidence === "string" ? `_${evidence}` : evidence ? "_evidence" : ""}.pdf`;
}

export function legalAnalysisHtml(analysis: LegalAnalysis, reviews: AnalyzedReview[]) {
  return `<h2>Legal Expert Analysis</h2><p class="note">${escapeHtml(analysis.disclaimer)}</p>
${analysis.reviews
  .map(
    (item) => `<section class="review">
<h3>${escapeHtml(reviews.find((review) => review.id === item.review_id)?.author || item.review_id)}</h3>
<p>Policy concern: ${item.violates_policy ? "Potential supported concern; Google decides" : "No substantiated violation"}</p>
<p>Policy citation: ${escapeHtml(item.policy_type)} / ${escapeHtml(item.policy_section)}</p>
<p class="text">${escapeHtml(item.policy_url)}</p>
<p class="text">Evidence quote: ${escapeHtml(item.evidence_quote || "No supported policy evidence")}</p>
<p class="text">Legal grounds: ${escapeHtml(item.legal_grounds)}</p>
<p>Removal likelihood: ${item.violates_policy ? `${item.removal_likelihood}% (uncalibrated AI estimate, not a verified probability)` : "Not estimable (0 score; insufficient evidence)"}</p>
<p class="text">Reasoning: ${escapeHtml(item.reasoning)}</p>
<p class="text">Supporting documents to obtain (not supplied): ${escapeHtml(item.supporting_docs.join("; ") || "None established")}</p>
${item.removal_request_text ? `<h3>Formal policy removal request draft</h3><p class="text">${escapeHtml(item.removal_request_text)}</p>` : "<p>No removal request drafted without supported evidence.</p>"}
</section>`,
  )
  .join("")}`;
}

export function escapeHtml(value: string | number | null | undefined) {
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
  const legal = savedLegalAnalysis(report.report_data);
  const stars = starBreakdown(reviews);
  const removal = removalSummary(legal?.reviews ?? [], reviews.length);
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
&middot; High risk: ${reviews.filter((review) => review.analysis?.risk === "high").length} &middot; Medium risk: ${reviews.filter((review) => review.analysis?.risk === "medium").length}
&middot; Normal: ${reviews.filter((review) => review.analysis?.risk === "normal").length} &middot; Requires review: ${unresolved}</p>
<p class="note">Source: Google Places API (New). The official API provides up to 5 reviews per business, not all reviews.</p>
<p>${reviews.length} of ${escapeHtml(scan.total_reviews)} reviews fetched. Fetched star breakdown: ${stars.map((count, index) => `${index + 1}-star: ${count}`).join(" / ")}. Full breakdown requires the client's Google Business Profile.</p>
<h2>Removal Possibility Summary</h2><p>High (red): ${removal.high} / Medium (orange): ${removal.medium} / Low (yellow): ${removal.low}</p><p class="note">Uncalibrated advisory scores, not verified chances. High 70-100, medium 40-69, low 0-39. Unsupported cases are not estimable.</p>
<h2>Review details and AI assessments</h2>
${reviews
  .map(
    (review) => `<section class="review">
<b>${escapeHtml(review.author)}</b> &middot; ${review.rating}/5 &middot; ${escapeHtml(review.analysis?.risk ?? "requires_review")}
<p style="padding:5px;background:${{ high: "#fee2e2", medium: "#ffedd5", low: "#fef9c3" }[removalBand(legal?.reviews.find((item) => item.review_id === review.id))]}">Removal band: ${removalBand(legal?.reviews.find((item) => item.review_id === review.id))} (advisory only)</p>
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
${legal ? legalAnalysisHtml(legal, reviews) : ""}
<h2>Action Plan</h2><p>Prioritize supported high-score policy concerns, then supported medium-score concerns. Review each source quote and authentic supporting facts before manually submitting via Google. Do not report genuine complaints merely because they are negative. Retain submitted request and case references for follow-up. Google controls review and appeal timelines; no fixed removal date can be predicted or guaranteed.</p>
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
            '<div style="font:9px Arial;width:100%;text-align:center;color:#526276">CONFIDENTIAL — For Super Admin Only &middot; Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
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
  completingScan = false,
) {
  reportIdSchema.parse(scanId);
  const [scan, report] = await Promise.all([
    supabase.from("scans").select("*").eq("id", scanId).eq("user_id", userId).maybeSingle(),
    supabase.from("reports").select("*").eq("scan_id", scanId).eq("user_id", userId).maybeSingle(),
  ]);
  if (scan.error || report.error) throw new Error("Could not verify report ownership.");
  if (
    !scan.data ||
    !report.data ||
    (scan.data.status !== "complete" &&
      !(completingScan && scan.data.status === "running" && scan.data.stage === "analyze")) ||
    scan.data.is_seed
  )
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
  const legal = await generateLegalAnalysis(scan.data.business_name || "Business", reviews);
  const metadata = report.data.report_data;
  const newMetadata = {
    ...(metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {}),
    legal_analysis: legal,
  };
  const reportWithLegal = { ...report.data, report_data: newMetadata };
  const fullHtml = reportPdfHtml(scan.data, reportWithLegal, reviews);
  const pdfBuffer = await renderReportPdf(fullHtml);
  const url = await saveReportToVPS(scanId, pdfBuffer);
  const legalHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font:12px Arial;line-height:1.6;color:#13243b}.review{border:1px solid #ccd4df;padding:12px;margin:14px 0}.text{white-space:pre-wrap;overflow-wrap:anywhere}.note{font-size:10px}</style></head><body><h1>Legal Removal Request Assessment</h1><h2>${escapeHtml(scan.data.business_name)}</h2><p>${escapeHtml(report.data.report_number)} / ${escapeHtml(scan.data.created_at)}</p>${legalAnalysisHtml(legal, reviews)}<p>Nothing has been submitted to Google. Unsupported assessments are not removal requests.</p></body></html>`;
  const legalPdf = await renderReportPdf(legalHtml);
  const legalUrl = await saveReportToVPS(scanId, legalPdf, undefined, "legal");
  if (scan.data.business_id) {
    await saveReportToVPS(scanId, pdfBuffer, scan.data.business_id);
    await saveReportToVPS(scanId, legalPdf, scan.data.business_id, "legal");
    const evidenceHtml = fullHtml.replace(
      "Google Review Risk Report</h1>",
      "Review Evidence Appendix</h1>",
    );
    const evidencePdf = await renderReportPdf(evidenceHtml);
    await saveReportToVPS(scanId, evidencePdf, scan.data.business_id, true);
  }
  await saveReportToVPS(scanId, pdfBuffer, "shared");
  await saveReportToVPS(scanId, legalPdf, "shared", "legal");
  const updated = await supabase
    .from("reports")
    .update({
      report_data: {
        ...newMetadata,
        pdf_url: url,
        pdf_saved_at: new Date().toISOString(),
        pdf_status: "ready",
        report_url: url,
        legal_pdf_url: legalUrl,
        legal_pdf_saved_at: new Date().toISOString(),
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
  return { url, legalUrl };
}
