import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { scanQuery, type AnalyzedReview } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";
import { saveReportPdf } from "@/lib/report-pdf.functions";
import { useFeatureSettings } from "@/lib/use-feature-settings";
import { reportAccessQuery, RestrictedReportSummary } from "@/components/restricted-report-summary";
import { Button } from "@/components/ui/button";
import { RemovalSubmissionForm } from "@/components/removal-workflow";

export function SimpleScanReport({ scanId }: { scanId: string }) {
  const access = useQuery(reportAccessQuery());
  const scanQueryResult = useQuery(scanQuery(scanId));
  const features = useFeatureSettings();
  const generateReport = useServerFn(saveReportPdf);
  const queryClient = useQueryClient();
  const [busyReviewId, setBusyReviewId] = useState<string | null>(null);
  const outcomesQuery = useQuery({
    queryKey: ["simple-scan-report-outcomes", scanId],
    enabled: access.data === "super_admin",
    queryFn: async () => {
      const result = await supabase
        .from("removal_outcomes")
        .select("*")
        .eq("scan_id", scanId)
        .order("submitted_at", { ascending: false })
        .throwOnError();
      return result.data;
    },
    refetchInterval: 60000,
  });

  if (access.error)
    return <p role="alert">Could not verify report access: {access.error.message}</p>;
  if (access.data && access.data !== "super_admin")
    return <RestrictedReportSummary scanId={scanId} />;
  if (access.isPending || scanQueryResult.isLoading)
    return <p className="text-muted-foreground">Loading scan report…</p>;
  if (scanQueryResult.error)
    return <p role="alert">Could not load scan report: {scanQueryResult.error.message}</p>;

  const data = scanQueryResult.data;
  if (!data?.scan || !data.report || data.scan.status !== "complete")
    return <p role="alert">A completed saved scan report was not found.</p>;

  const { scan, reviews } = data;

  async function prepareReport(reviewId: string) {
    setBusyReviewId(reviewId);
    try {
      await generateReport({ data: { scanId } });
      await queryClient.invalidateQueries({ queryKey: ["scan", scanId] });
      await queryClient.invalidateQueries({ queryKey: ["simple-scan-report-outcomes", scanId] });
      toast.success("Report ready. Nothing was submitted to Google.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Report could not be prepared.");
    } finally {
      setBusyReviewId(null);
    }
  }

  async function copyReport(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Report copied. Review its facts before submitting.");
    } catch (error) {
      console.error("[simple-scan-report] Clipboard copy failed", error);
      toast.error("Could not copy the report. Select and copy its text manually.");
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5">
      <header className="surface p-6">
        <h1 className="text-2xl font-bold">Scan Report</h1>
        <p className="mt-2">
          <span className="font-semibold">Business:</span> {scan.business_name ?? "—"}
        </p>
        <p>
          <span className="font-semibold">Rating:</span>{" "}
          {scan.rating == null ? "—" : Number(scan.rating).toFixed(1)} ⭐ ({reviews.length} of{" "}
          {scan.total_reviews?.toLocaleString() ?? "—"} fetched)
        </p>
      </header>

      <section className="surface space-y-3 p-5">
        <h2 className="font-bold">REVIEWS</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b">
                {["#", "Business", "Review", "Category", "Score", "Action"].map((label) => (
                  <th className="p-3" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reviews.map((review: AnalyzedReview, index) => {
                const legal = review.legal;
                const outcome = outcomesQuery.data?.find((row) => row.review_id === review.id);
                const score = legal?.violates_policy ? legal.removal_likelihood : null;
                const color =
                  score == null
                    ? "text-muted-foreground"
                    : score >= 80
                      ? "text-red-600"
                      : score >= 60
                        ? "text-orange-600"
                        : score >= 40
                          ? "text-yellow-700"
                          : "text-muted-foreground";
                return (
                  <tr className="border-b last:border-0" key={review.id}>
                    <td className="p-3">{index + 1}</td>
                    <td className="p-3">{scan.business_name ?? "—"}</td>
                    <td className="max-w-[24rem] truncate p-3" title={review.text ?? ""}>
                      {review.text || "No review text"}
                    </td>
                    <td className="p-3">
                      {legal?.violates_policy
                        ? legal.policy_type
                        : (review.analysis?.category ?? "—")}
                    </td>
                    <td
                      className={`whitespace-nowrap p-3 font-semibold ${color}`}
                      title="Advisory score; not a verified removal probability"
                    >
                      {score == null ? "—" : `${score}%`}
                    </td>
                    <td className="p-3">
                      {legal?.removal_request_text ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void copyReport(legal.removal_request_text)}
                          >
                            Copy report
                          </Button>
                          <Button size="sm" variant="outline" asChild>
                            <a
                              href={review.review_uri ?? scan.maps_uri ?? scan.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Open in Google Maps
                            </a>
                          </Button>
                        </div>
                      ) : legal ? (
                        <span className="text-muted-foreground">No supported report</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyReviewId !== null || !features.data?.legal_expert_enabled}
                          onClick={() => void prepareReport(review.id)}
                        >
                          {busyReviewId === review.id ? "Preparing…" : "Send"}
                        </Button>
                      )}
                      {legal?.removal_request_text &&
                        features.data?.appeal_tracking_enabled &&
                        !outcome && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs">
                              Record actual submission
                            </summary>
                            <RemovalSubmissionForm scan={scan} review={review} legal={legal} />
                          </details>
                        )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {features.error && (
          <p role="alert">Could not load report controls: {features.error.message}</p>
        )}
        {outcomesQuery.error && (
          <p role="alert">Could not load submitted reports: {outcomesQuery.error.message}</p>
        )}
      </section>

      <section className="surface space-y-3 p-5">
        <h2 className="font-bold">SUBMITTED</h2>
        {outcomesQuery.data?.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[660px] text-left text-sm">
                <thead>
                  <tr className="border-b">
                    {[
                      "#",
                      "Business",
                      "Status",
                      "Response date",
                      "Response / reference",
                      "Action",
                    ].map((label) => (
                      <th className="p-3" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {outcomesQuery.data.map((outcome, index) => (
                    <tr className="border-b last:border-0" key={outcome.id}>
                      <td className="p-3">{index + 1}</td>
                      <td className="p-3">{scan.business_name ?? "—"}</td>
                      <td className="whitespace-nowrap p-3">
                        {outcome.outcome === "approved"
                          ? "✅ Removed"
                          : outcome.outcome === "rejected"
                            ? "❌ Rejected"
                            : "⏳ Pending"}
                      </td>
                      <td className="whitespace-nowrap p-3">
                        {outcome.response_at
                          ? new Date(outcome.response_at).toLocaleDateString()
                          : "—"}
                      </td>
                      <td
                        className="max-w-[18rem] truncate p-3"
                        title={outcome.verification_reference}
                      >
                        {outcome.verification_reference || "—"}
                      </td>
                      <td className="p-3">
                        {outcome.outcome === "rejected" && (
                          <a
                            className="whitespace-nowrap text-brand underline"
                            href={scan.maps_uri ?? scan.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open in Google Maps
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Status and references are manually recorded. Google status is not polled
              automatically.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No submissions recorded.</p>
        )}
      </section>
    </main>
  );
}
