import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  readPersistedRuleScore,
  runMicroRules,
  type MicroRuleResult,
  type PersistedRuleScore,
} from "./rules/micro-rules";

export type Scan = Tables<"scans">;
export type Report = Tables<"reports">;
export type Risk = "high" | "medium" | "normal" | "requires_review";

/** Original Google review data + separately stored AI analysis. */
export type AnalyzedReview = {
  user_selected?: boolean;
  review_url?: string | null;
  legal?: import("./legal-analysis").LegalReview | undefined;
  id: string;
  author: string;
  rating: number;
  published_at: string | null;
  relative_time: string | null;
  text: string | null;
  review_uri: string | null;
  analysis: {
    verification?: import("@/integrations/supabase/types").Json;
    risk: Risk;
    category: string | null;
    signals: string[];
    reason: string | null;
    evidence: string | null;
    confidence: number;
    model: string | null;
    microRuleScore?: PersistedRuleScore | null;
    microRuleRecheck?: MicroRuleResult;
  } | null;
};

export const riskOf = (r: AnalyzedReview): Risk => r.analysis?.risk ?? "requires_review";
export const isFlagged = (r: AnalyzedReview) => ["high", "medium"].includes(riskOf(r));

export function savedPdfUrl(metadata: import("@/integrations/supabase/types").Json | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const url = metadata["pdf_url"];
  const date = metadata["pdf_saved_at"];
  if (
    typeof url !== "string" ||
    typeof date !== "string" ||
    !Number.isFinite(Date.parse(date)) ||
    Date.now() - Date.parse(date) >= 90 * 86400000
  )
    return null;
  return isPrivateStoragePdfUrl(url, /^[0-9a-f-]{36}\.pdf$/);
}

export function isPrivateStoragePdfUrl(url: string, filenamePattern: RegExp) {
  try {
    const parsed = new URL(url);
    return parsed.origin === "https://ratingguard.online" &&
      parsed.pathname === "/api/storage/download" &&
      /^reports\/[0-9a-f-]{36}$/.test(parsed.searchParams.get("folder") ?? "") &&
      filenamePattern.test(parsed.searchParams.get("filename") ?? "")
      ? url
      : null;
  } catch {
    return null;
  }
}

export const scansQuery = () =>
  queryOptions({
    queryKey: ["scans"],
    queryFn: async () => {
      const scans = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase
          .from("scans")
          .select(
            "*, reports!reports_scan_id_fkey(id, report_number, status, created_at, report_data)",
          )
          .order("created_at", { ascending: false })
          .order("id")
          .range(offset, offset + 499);
        if (error) throw error;
        scans.push(...data);
        if (data.length < 500) return scans;
        if (scans.length >= 50000)
          throw new Error(
            "History exceeds 50,000 scans; narrow server-side history before loading.",
          );
      }
    },
  });

export type ScanRow = Awaited<
  ReturnType<NonNullable<ReturnType<typeof scansQuery>["queryFn"]>>
>[number];

export type DashboardScanRow = Pick<
  Scan,
  | "id"
  | "is_seed"
  | "business_name"
  | "source_url"
  | "address"
  | "region"
  | "status"
  | "rating"
  | "reviews_retrieved"
  | "high_count"
  | "medium_count"
  | "normal_count"
  | "requires_review_count"
  | "created_at"
  | "error"
> & { reports: Pick<Report, "report_number"> | null };

export const dashboardScansQuery = () =>
  queryOptions({
    queryKey: ["dashboard-scans"],
    queryFn: async () => {
      const scans: DashboardScanRow[] = [];
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await supabase
          .from("scans")
          .select(
            "id,is_seed,business_name,source_url,address,region,status,rating,reviews_retrieved,high_count,medium_count,normal_count,requires_review_count,created_at,error,reports!reports_scan_id_fkey(report_number)",
          )
          .order("created_at", { ascending: false })
          .order("id")
          .range(offset, offset + 99);
        if (error) throw error;
        scans.push(...data);
        if (data.length < 100) return scans;
        if (scans.length >= 50000)
          throw new Error(
            "History exceeds 50,000 scans; narrow server-side history before loading.",
          );
      }
    },
  });

export const scanQuery = (id: string) =>
  queryOptions({
    queryKey: ["scan", id],
    queryFn: async () => {
      const [s, r, rep] = await Promise.all([
        supabase.from("scans").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("reviews")
          .select(
            "id, author, rating, published_at, relative_time, text, review_uri, user_selected, review_url, review_analyses!review_analyses_review_id_fkey(risk, category, signals, reason, evidence, confidence, model, verification)",
          )
          .eq("scan_id", id),
        supabase.from("reports").select("*").eq("scan_id", id).maybeSingle(),
      ]);
      if (s.error) throw s.error;
      if (r.error) throw r.error;
      if (rep.error) throw rep.error;
      const order: Record<string, number> = { high: 0, medium: 1, requires_review: 2, normal: 3 };
      const rawReviews = r.data ?? [];
      const reviews: AnalyzedReview[] = rawReviews.map(({ review_analyses, ...rest }) => {
        const a = Array.isArray(review_analyses) ? review_analyses[0] : review_analyses;
        const history = rawReviews
          .filter((item) => item.id !== rest.id)
          .map((item) => ({
            text: item.text ?? "",
            rating: item.rating,
            ...(item.published_at ? { publishedAt: item.published_at } : {}),
            ...(item.author ? { reviewerName: item.author } : {}),
            ...(s.data?.business_name ? { businessName: s.data.business_name } : {}),
            platform: "Google",
          }));
        const microRuleRecheck = runMicroRules({
          text: rest.text ?? "",
          rating: rest.rating,
          ...(rest.published_at ? { reviewDate: rest.published_at } : {}),
          ...(s.data?.business_name ? { businessName: s.data.business_name } : {}),
          history,
        });
        return {
          ...rest,
          analysis: a
            ? {
                ...a,
                risk: normalizeRisk(a.risk),
                microRuleScore: readPersistedRuleScore(a.verification),
                microRuleRecheck,
              }
            : null,
        };
      });
      const { savedLegalAnalysis } = await import("./legal-analysis");
      const legal = savedLegalAnalysis(rep.data?.report_data);
      for (const review of reviews)
        review.legal = legal?.reviews.find((item) => item.review_id === review.id);
      reviews.sort((a, b) => (order[riskOf(a)] ?? 9) - (order[riskOf(b)] ?? 9));
      return { scan: s.data, reviews, report: rep.data };
    },
  });

function normalizeRisk(risk: string): Risk {
  return risk === "high" || risk === "medium" || risk === "normal" ? risk : "requires_review";
}

export function scanRisk(s: Scan): Risk {
  if (s.high_count > 0) return "high";
  if (s.medium_count > 0) return "medium";
  if (s.requires_review_count > 0) return "requires_review";
  return "normal";
}
export const riskyCount = (s: Scan) => s.high_count + s.medium_count;
export const analyzedCount = (s: Scan) =>
  s.high_count + s.medium_count + s.normal_count + s.requires_review_count;

export const reportNumber = (
  s: { id: string; is_seed?: boolean },
  rep?: { report_number: string } | null,
) =>
  rep?.report_number ??
  (s.is_seed ? "DEV-" : "RPT-") + s.id.replace(/-/g, "").slice(0, 8).toUpperCase();
export const fmtDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "—";

export const GOOGLE_POLICY_URL = "https://support.google.com/contributionpolicy/answer/7400114";
