import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { scanQuery, type AnalyzedReview } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";
import { saveReportPdf } from "@/lib/report-pdf.functions";
import { useFeatureSettings } from "@/lib/use-feature-settings";
import { isGoogleReviewUrl, sameGoogleReviewUrl } from "@/lib/google-url";
import { reportAccessQuery, RestrictedReportSummary } from "@/components/restricted-report-summary";
import { Button } from "@/components/ui/button";
import { RemovalSubmissionForm } from "@/components/removal-workflow";
import { ExtensionLauncher } from "@/components/extension-launcher";

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
  const singleReviewMode = isGoogleReviewUrl(scan.source_url);
  const targetReview = singleReviewMode
    ? reviews.find(
        (review) => review.review_uri && sameGoogleReviewUrl(scan.source_url, review.review_uri),
      )
    : undefined;
  const visibleReviews = singleReviewMode && targetReview ? [targetReview] : reviews;
  const counts = visibleReviews.reduce(
    (total, review) => {
      const risk = review.analysis?.risk ?? "requires_review";
      total[risk] += 1;
      return total;
    },
    { high: 0, medium: 0, normal: 0, requires_review: 0 },
  );

  async function prepareReport(reviewId: string) {
    setBusyReviewId(reviewId);
    try {
      await generateReport({ data: { scanId, reviewId } });
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
        <p className="mt-3 text-sm text-muted-foreground">
          Analysis is advisory: no detected signal does not prove a review is genuine, and Google
          decides whether content violates its policy. Drafts are not submitted automatically.
        </p>
      </header>

      {access.data === "super_admin" && <ExtensionLauncher scanId={scanId} />}

      <section className="surface space-y-3 p-5">
        <h2 className="font-bold">{singleReviewMode ? "SINGLE REVIEW" : "REVIEWS"}</h2>
        {singleReviewMode && (
          <div
            className={`rounded border p-3 text-sm ${targetReview ? "border-risk-normal/40" : "border-risk-medium/40"}`}
            role={targetReview ? "status" : "alert"}
          >
            {targetReview
              ? "Exact review URL matched. The draft below is ready to review and submit manually."
              : "Google Places did not return an exact match for this review URL in its available review sample (up to five reviews). Open the business page and use a matching review URL; no review-specific report can be generated from unmatched content."}
          </div>
        )}
        <div className="grid gap-2 text-sm sm:grid-cols-4" aria-label="Analysis summary">
          <p>High signals: {counts.high}</p>
          <p>Medium signals: {counts.medium}</p>
          <p>Manual review: {counts.requires_review}</p>
          {!singleReviewMode && <p>No signal identified: {counts.normal}</p>}
        </div>
        {singleReviewMode && targetReview && (
          <SingleReviewDraft scanName={scan.business_name ?? "Business"} review={targetReview} />
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b">
                {[
                  "#",
                  "Review",
                  "Assessment",
                  "Evidence & checks",
                  ...(!singleReviewMode ? ["Removal estimate"] : []),
                  "Action",
                ].map((label) => (
                  <th className="p-3" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleReviews.map((review: AnalyzedReview, index) => {
                const legal = review.legal;
                const outcome = outcomesQuery.data?.find((row) => row.review_id === review.id);
                const score =
                  legal?.violates_policy && legal.prediction ? legal.prediction.probability : null;
                const analysis = review.analysis;
                const needsReview = !analysis || analysis.risk === "requires_review";
                const unverifiedSignal =
                  needsReview && Boolean(analysis?.category) && (analysis?.confidence ?? 0) >= 40;
                const lowSignal =
                  needsReview && Boolean(analysis?.category) && (analysis?.confidence ?? 0) < 40;
                const assessment =
                  analysis?.risk === "high"
                    ? { label: "High policy signal", style: "bg-risk-high-soft text-risk-high" }
                    : analysis?.risk === "medium" || unverifiedSignal
                      ? {
                          label: "Medium policy signal",
                          style: "bg-risk-medium-soft text-risk-medium",
                        }
                      : lowSignal
                        ? {
                            label: "Low signal — verify",
                            style: "bg-yellow-100 text-yellow-800",
                          }
                        : needsReview
                          ? {
                              label: "Manual review required",
                              style: "bg-muted text-muted-foreground",
                            }
                          : {
                              label: "No supported signal found",
                              style: "bg-muted text-muted-foreground",
                            };
                const scoreColor =
                  score == null
                    ? "text-muted-foreground"
                    : score >= 70
                      ? "text-risk-high"
                      : score >= 40
                        ? "text-risk-medium"
                        : "text-yellow-700";
                const ruleScore = analysis?.microRuleScore;
                const canPrepareReport = analysis?.risk === "high" || analysis?.risk === "medium";
                return (
                  <tr className="border-b last:border-0" key={review.id}>
                    <td className="p-3">{index + 1}</td>
                    <td className="max-w-[24rem] truncate p-3" title={review.text ?? ""}>
                      {review.text || "No review text"}
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded px-2 py-1 text-xs font-semibold ${assessment.style}`}
                      >
                        {assessment.label}
                      </span>
                      <p className="mt-1">
                        Policy:{" "}
                        {legal?.violates_policy ? legal.policy_type : (analysis?.category ?? "—")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {analysis
                          ? singleReviewMode
                            ? "Preliminary policy screening"
                            : `${analysis.confidence}% analysis confidence`
                          : "Analysis unavailable"}
                        {analysis?.model ? ` · ${analysis.model}` : ""}
                      </p>
                    </td>
                    <td className="max-w-[22rem] p-3">
                      <p>
                        {analysis?.evidence ||
                          analysis?.signals?.join("; ") ||
                          "No quoted evidence returned."}
                      </p>
                      {analysis?.reason && (
                        <p className="mt-1 text-xs text-muted-foreground">{analysis.reason}</p>
                      )}
                      {ruleScore ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Rules: {ruleScore.checksAssessed}/{ruleScore.checksRun} assessed ·{" "}
                          {ruleScore.checksFlagged} signal(s)
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Rules diagnostics unavailable.
                        </p>
                      )}
                    </td>
                    {!singleReviewMode && (
                      <td className={`whitespace-nowrap p-3 font-semibold ${scoreColor}`}>
                        {score == null ? (
                          <span
                            title={
                              legal?.violates_policy
                                ? "At least 30 comparable, recorded outcomes are required before showing a cohort percentage."
                                : "No supported policy concern or comparable outcome estimate is available."
                            }
                          >
                            {legal?.violates_policy ? "Not estimable" : "Not estimated"}
                            {legal?.prediction ? ` · n=${legal.prediction.sample_size}` : ""}
                          </span>
                        ) : (
                          <span title="Historical cohort rate from manually recorded outcomes; not an individually calibrated or guaranteed probability.">
                            {score}% cohort estimate · n={legal.prediction?.sample_size}
                          </span>
                        )}
                      </td>
                    )}
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
                      ) : !canPrepareReport ? (
                        <span className="text-muted-foreground">
                          {needsReview
                            ? "Verify evidence before preparing a report"
                            : "No report recommended"}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyReviewId !== null || !features.data?.legal_expert_enabled}
                          onClick={() => void prepareReport(review.id)}
                        >
                          {busyReviewId === review.id ? "Preparing…" : "Prepare report"}
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

function SingleReviewDraft({ scanName, review }: { scanName: string; review: AnalyzedReview }) {
  const supportedEvidence = review.analysis?.evidence?.trim();
  const policySignal = review.analysis?.category?.trim();
  const draft = [
    "Please review this Google Maps review under the applicable content policies.",
    "",
    `Business: ${scanName}`,
    `Reviewer: ${review.author}`,
    `Rating: ${review.rating}/5`,
    `Review URL: ${review.review_uri}`,
    `Review text: "${review.text ?? ""}"`,
    "",
    policySignal
      ? `Potentially relevant policy signal from automated screening: ${policySignal}. This is a preliminary signal, not a finding that a policy was violated.`
      : "No specific policy violation was established by automated screening. Please assess the review independently under Google's current policies.",
    supportedEvidence ? `Quoted evidence to verify: "${supportedEvidence}"` : "",
    "",
    "Please assess the complete review in context and take action only if it meets Google's current removal criteria. Add any accurate, verifiable supporting information before submitting. This request does not guarantee removal.",
  ]
    .filter((line) => line !== "")
    .join("\n");
  return (
    <section className="rounded border p-4">
      <h3 className="font-semibold">Copy-ready request for Google</h3>
      <p className="my-2 text-sm">
        Review the wording and evidence before submitting. Google decides the outcome; this app does
        not submit on your behalf.
      </p>
      <textarea
        aria-label="Copy-ready single review request"
        readOnly
        value={draft}
        rows={12}
        className="w-full rounded border bg-transparent p-3 text-sm"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void copyReport(draft)}>
          Copy request
        </Button>
        <Button variant="outline" asChild>
          <a
            href="https://support.google.com/business/troubleshooter/2690762"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Google report form
          </a>
        </Button>
      </div>
    </section>
  );
}
