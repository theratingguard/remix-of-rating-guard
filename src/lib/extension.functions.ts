import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { savedLegalAnalysis } from "./legal-analysis";

export const getExtensionReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ scanId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    if ((await context.supabase.rpc("report_access_level").throwOnError()).data !== "super_admin")
      throw new Error("Access Denied: extension report access is Super Admin only.");
    const [scan, report, reviews] = await Promise.all([
      context.supabase
        .from("scans")
        .select("business_name")
        .eq("id", data.scanId)
        .single()
        .throwOnError(),
      context.supabase
        .from("reports")
        .select("report_data")
        .eq("scan_id", data.scanId)
        .single()
        .throwOnError(),
      context.supabase
        .from("reviews")
        .select("id,text,review_uri")
        .eq("scan_id", data.scanId)
        .throwOnError(),
    ]);
    const legal = savedLegalAnalysis(report.data.report_data);
    return {
      user: { email: typeof context.claims.email === "string" ? context.claims.email : null },
      scanId: data.scanId,
      business: scan.data.business_name,
      reviews: (legal?.reviews ?? []).flatMap((item) => {
        const source = reviews.data.find((review) => review.id === item.review_id);
        if (
          !item.violates_policy ||
          !item.removal_request_text ||
          !item.evidence_quote ||
          !source?.text?.includes(item.evidence_quote) ||
          !source.review_uri
        )
          return [];
        const url = new URL(source.review_uri);
        if (
          url.protocol !== "https:" ||
          !["www.google.com", "maps.google.com", "google.com"].includes(url.hostname)
        )
          return [];
        return [
          {
            reviewId: item.review_id,
            reviewUrl: url.href,
            policy: item.policy_type,
            evidence: item.evidence_quote,
            request: item.removal_request_text,
          },
        ];
      }),
    };
  });
