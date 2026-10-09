import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Scan = Tables<"scans">;
export type Report = Tables<"reports">;
export type Risk = "high" | "medium" | "normal" | "requires_review";

/** Original Google review data + separately stored AI analysis. */
export type AnalyzedReview = {
  id: string; author: string; rating: number; published_at: string | null; relative_time: string | null;
  text: string | null; review_uri: string | null;
  analysis: { risk: Risk; category: string | null; signals: string[]; reason: string | null; evidence: string | null; confidence: number; model: string | null } | null;
};

export const riskOf = (r: AnalyzedReview): Risk => r.analysis?.risk ?? "requires_review";
export const isFlagged = (r: AnalyzedReview) => ["high", "medium"].includes(riskOf(r));

export const scansQuery = () =>
  queryOptions({
    queryKey: ["scans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("scans").select("*, reports(id, report_number, status, created_at)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export type ScanRow = Awaited<ReturnType<NonNullable<ReturnType<typeof scansQuery>["queryFn"]>>>[number];

export const scanQuery = (id: string) =>
  queryOptions({
    queryKey: ["scan", id],
    queryFn: async () => {
      const [s, r, rep] = await Promise.all([
        supabase.from("scans").select("*").eq("id", id).maybeSingle(),
        supabase.from("reviews").select("id, author, rating, published_at, relative_time, text, review_uri, review_analyses(risk, category, signals, reason, evidence, confidence, model)").eq("scan_id", id),
        supabase.from("reports").select("*").eq("scan_id", id).maybeSingle(),
      ]);
      if (s.error) throw s.error;
      if (r.error) throw r.error;
      const order: Record<string, number> = { high: 0, medium: 1, requires_review: 2, normal: 3 };
      const reviews: AnalyzedReview[] = (r.data ?? []).map(({ review_analyses, ...rest }: any) => {
        const a = Array.isArray(review_analyses) ? review_analyses[0] : review_analyses;
        return { ...rest, analysis: a ?? null };
      });
      reviews.sort((a, b) => (order[riskOf(a)] ?? 9) - (order[riskOf(b)] ?? 9));
      return { scan: s.data, reviews, report: rep.data };
    },
  });

export function scanRisk(s: Scan): Risk {
  if (s.high_count > 0) return "high";
  if (s.medium_count > 0) return "medium";
  if (s.requires_review_count > 0) return "requires_review";
  return "normal";
}
export const riskyCount = (s: Scan) => s.high_count + s.medium_count;
export const analyzedCount = (s: Scan) => s.high_count + s.medium_count + s.normal_count + s.requires_review_count;

export const reportNumber = (s: { id: string; is_seed?: boolean }, rep?: { report_number: string } | null) =>
  rep?.report_number ?? (s.is_seed ? "DEV-" : "RPT-") + s.id.replace(/-/g, "").slice(0, 8).toUpperCase();
export const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

export const GOOGLE_REPORT_URL = "https://support.google.com/business/workflow/9945796";
export const GOOGLE_POLICY_URL = "https://support.google.com/contributionpolicy/answer/7400114";
