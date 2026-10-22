import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { LEGAL_TEMPLATE_KINDS } from "./legal-templates/country-templates";
import { detectCountry, generateLegalRequest } from "./legal-orchestrator.server";

export const generateCountryLegalRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        scanId: z.string().uuid(),
        reviewId: z.string().uuid(),
        template: z.enum(LEGAL_TEMPLATE_KINDS),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const [scan, review] = await Promise.all([
      context.supabase
        .from("scans")
        .select("id,region,address,business_name")
        .eq("id", data.scanId)
        .eq("user_id", context.userId)
        .maybeSingle()
        .throwOnError(),
      context.supabase
        .from("reviews")
        .select(
          "id,author,review_uri,text,review_analyses!review_analyses_review_id_fkey(category,evidence)",
        )
        .eq("id", data.reviewId)
        .eq("scan_id", data.scanId)
        .maybeSingle()
        .throwOnError(),
    ]);
    if (!scan.data || !review.data) throw new Error("Scan or review not found for this account.");
    const analysis = Array.isArray(review.data.review_analyses)
      ? review.data.review_analyses[0]
      : review.data.review_analyses;
    const country = await detectCountry(scan.data);
    const enabled = (
      await context.supabase
        .rpc("country_legal_worker_enabled", { _country: country })
        .throwOnError()
    ).data;
    return generateLegalRequest(
      scan.data,
      {
        author: review.data.author,
        review_uri: review.data.review_uri,
        text: review.data.text,
        analysis: analysis
          ? {
              category: analysis.category,
              evidence: analysis.evidence,
            }
          : null,
      },
      data.template,
      { workerEnabled: enabled },
    );
  });
