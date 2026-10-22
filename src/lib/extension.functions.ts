import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { savedLegalAnalysis } from "./legal-analysis";
import { isGoogleMapsUrl } from "./google-url";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const extensionSubmissionSchema = z
  .object({
    scanId: z.string().uuid(),
    reviewId: z.string().uuid(),
    submittedAt: z.string().datetime(),
    verificationReference: z.string().trim().min(10).max(2000),
    requestText: z.string().trim().min(1).max(12000),
    confirmed: z.literal(true),
  })
  .refine((value) => Date.parse(value.submittedAt) <= Date.now(), {
    message: "Submission date cannot be in the future.",
  });

async function requireExtensionAccess(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase.rpc("report_access_level");
  if (error) throw new Error("Could not verify extension access.");
  if (data !== "super_admin")
    throw new Error("Access Denied: extension report access is Super Admin only.");
}

export const getExtensionReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ scanId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await requireExtensionAccess(context.supabase);
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
          !source.review_uri ||
          !isGoogleMapsUrl(source.review_uri)
        )
          return [];
        const url = new URL(source.review_uri);
        if (
          !/^\/maps\/reviews\//.test(url.pathname) ||
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

export const getExtensionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireExtensionAccess(context.supabase);
    return {
      authenticated: true,
      email: typeof context.claims.email === "string" ? context.claims.email : null,
      access: "super_admin",
    };
  });

export const recordExtensionSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => extensionSubmissionSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requireExtensionAccess(context.supabase);
    const [scan, report, review] = await Promise.all([
      context.supabase
        .from("scans")
        .select("category")
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
        .select("id,text")
        .eq("id", data.reviewId)
        .eq("scan_id", data.scanId)
        .single()
        .throwOnError(),
    ]);
    const legal = savedLegalAnalysis(report.data.report_data);
    const prepared = legal?.reviews.find((item) => item.review_id === data.reviewId);
    if (
      !prepared?.violates_policy ||
      !prepared.evidence_quote ||
      !review.data.text?.includes(prepared.evidence_quote) ||
      prepared.removal_request_text !== data.requestText
    )
      throw new Error("The request does not match a supported draft and its source review.");

    const inserted = await context.supabase
      .from("removal_outcomes")
      .insert({
        review_id: data.reviewId,
        scan_id: data.scanId,
        user_id: context.userId,
        policy_type: prepared.policy_type,
        business_type: scan.data.category?.trim() || "unknown",
        submitted_at: data.submittedAt,
        verification_reference: data.verificationReference,
        request_text: prepared.removal_request_text,
        evidence_used: {
          quote: prepared.evidence_quote,
          source:
            "User-confirmed actual Google Maps submission; not independently verified by Google.",
        },
      })
      .select("id,outcome,submitted_at")
      .single()
      .throwOnError();

    return {
      id: inserted.data.id,
      outcome: inserted.data.outcome,
      submittedAt: inserted.data.submitted_at,
    };
  });
