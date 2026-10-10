import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateOwnedReportPdf } from "./report-pdf.server";
import { sendReportEmail, smtpConfigured } from "./email.server";
import { getSettings, requireFeature } from "./settings.server";

export const reportEmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    configured: smtpConfigured() && (await getSettings()).email_share_enabled,
  }));

export const emailReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ scanId: z.string().uuid(), email: z.string().trim().email().max(254) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      await requireFeature("email_share_enabled");
      const [scan, report] = await Promise.all([
        context.supabase
          .from("scans")
          .select("business_name, status")
          .eq("id", data.scanId)
          .eq("user_id", context.userId)
          .maybeSingle(),
        context.supabase
          .from("reports")
          .select("report_data")
          .eq("scan_id", data.scanId)
          .eq("user_id", context.userId)
          .maybeSingle(),
      ]);
      if (scan.error || report.error) throw new Error("Could not load report for email sharing.");
      if (!scan.data || !report.data || scan.data.status !== "complete")
        throw new Error("Only your completed reports can be shared.");
      const metadata = report.data.report_data;
      const pdfUrl =
        metadata && typeof metadata === "object" && !Array.isArray(metadata)
          ? metadata["pdf_url"]
          : null;
      if (typeof pdfUrl !== "string")
        throw new Error("Generate the report PDF before emailing it.");
      return await sendReportEmail(data.email, pdfUrl, scan.data.business_name || "Business");
    } catch (error) {
      console.error(
        "[report-email] Could not email report",
        error instanceof Error ? error.message : "Unknown error",
      );
      throw error;
    }
  });

export const saveReportPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        scanId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      return await generateOwnedReportPdf(context.supabase, context.userId, data.scanId);
    } catch (error) {
      console.error("[report-pdf] VPS export failed", error);
      throw error;
    }
  });
