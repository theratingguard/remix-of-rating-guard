import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { savedPdfUrl } from "./data";

const activitySchema = z.object({
  id: z.string(),
  businessName: z.string().nullable(),
  createdAt: z.string(),
  action: z.string(),
  status: z.string(),
});

const dashboardSchema = z.object({
  totalReviewsScanned: z.number(),
  badReviewsDetected: z.number(),
  reportsSubmitted: z.number(),
  successfulRemovals: z.number(),
  recentActivity: z.array(activitySchema),
});

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Your session has expired. Please sign in again.");
  return data.user.id;
}

export const clientDashboardQuery = () =>
  queryOptions({
    queryKey: ["client-portal", "dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("client_dashboard_summary");
      if (error) throw error;
      const result = dashboardSchema.safeParse(data);
      if (!result.success) throw new Error("Dashboard data could not be read. Please refresh.");
      return result.data;
    },
  });

export type ClientScanDetails = {
  scan: {
    id: string;
    business_name: string | null;
    status: string;
    stage: string | null;
    reviews_retrieved: number;
  } | null;
  reviews: {
    id: string;
    author: string;
    rating: number;
    text: string | null;
    review_uri: string | null;
    risk: string;
    policy_category: string | null;
    reason: string | null;
    evidence: string | null;
    action_status: string | null;
  }[];
};

export const clientScanQuery = (scanId: string) =>
  queryOptions({
    queryKey: ["client-portal", "scan", scanId],
    enabled: Boolean(scanId),
    queryFn: async (): Promise<ClientScanDetails> => {
      const userId = await currentUserId();
      const { data: scan, error: scanError } = await supabase
        .from("scans")
        .select("id,business_name,status,stage,reviews_retrieved")
        .eq("id", scanId)
        .eq("user_id", userId)
        .maybeSingle();
      if (scanError) throw scanError;
      if (!scan) return { scan: null, reviews: [] };
      const { data: reviews, error: reviewError } = await supabase
        .from("reviews")
        .select("id,author,rating,text,review_uri,risk,policy_category,reason,evidence")
        .eq("scan_id", scan.id)
        .order("rating", { ascending: true })
        .limit(200);
      if (reviewError) throw reviewError;
      const reviewIds = (reviews ?? []).map((review) => review.id);
      const { data: actions, error: actionError } =
        reviewIds.length > 0
          ? await supabase
              .from("review_actions")
              .select("review_id,status")
              .eq("user_id", userId)
              .in("review_id", reviewIds)
          : { data: [], error: null };
      if (actionError) throw actionError;
      const actionByReview = new Map(
        (actions ?? []).map((action) => [action.review_id, action.status]),
      );
      return {
        scan,
        reviews: (reviews ?? []).map((review) => ({
          ...review,
          action_status: actionByReview.get(review.id) ?? null,
        })),
      };
    },
  });

export type ClientReportRow = {
  id: string;
  scanId: string;
  reportNumber: string;
  createdAt: string;
  businessName: string;
  status: "Pending" | "Removed" | "Rejected" | "Reported" | "Draft ready";
  pdfUrl: string | null;
};

export function clientReportStatus(status: string): ClientReportRow["status"] {
  switch (status.toLowerCase()) {
    case "pending":
      return "Pending";
    case "removed":
      return "Removed";
    case "rejected":
      return "Rejected";
    case "reported":
      return "Reported";
    case "draft ready":
      return "Draft ready";
    default:
      throw new Error("Report status could not be read.");
  }
}

const clientReportPageSchema = z.object({
  total: z.number().int().nonnegative(),
  reports: z.array(
    z.object({
      id: z.string(),
      scanId: z.string(),
      reportNumber: z.string(),
      createdAt: z.string(),
      businessName: z.string(),
      status: z.string(),
      reportData: z.unknown(),
    }),
  ),
});

export const clientReportsQuery = (page = 0, search = "") =>
  queryOptions({
    queryKey: ["client-portal", "reports", page, search],
    queryFn: async (): Promise<{ reports: ClientReportRow[]; total: number }> => {
      if (!Number.isInteger(page) || page < 0) throw new Error("Invalid report page.");
      const { data, error } = await supabase.rpc("client_report_page", {
        _search: search.trim() || null,
        _limit: 50,
        _offset: page * 50,
      });
      if (error) throw error;
      const result = clientReportPageSchema.safeParse(data);
      if (!result.success) throw new Error("Report data could not be read. Please refresh.");
      return {
        total: result.data.total,
        reports: result.data.reports.map((report) => ({
          id: report.id,
          scanId: report.scanId,
          reportNumber: report.reportNumber,
          createdAt: report.createdAt,
          businessName: report.businessName,
          status: clientReportStatus(report.status),
          pdfUrl: savedPdfUrl(report.reportData as Json),
        })),
      };
    },
  });
