import { ScanTimeline } from "@/components/ops-panels";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ArrowLeft, Download, Flag } from "lucide-react";
import { scanQuery, fmtDate, reportNumber, riskOf, isFlagged, savedPdfUrl } from "@/lib/data";
import { logAudit } from "@/lib/scan.functions";
import { Stars, RiskBadge, SeedBadge } from "@/components/review-ui";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { saveReportPdf, emailReport, reportEmailStatus } from "@/lib/report-pdf.functions";
import { Input } from "@/components/ui/input";
import { ReviewSelection } from "@/components/review-selection";
import { LegalAnalysisPanel } from "@/components/legal-analysis";
import { RemovalSummary } from "@/components/removal-summary";
import { RatingAnalysis } from "@/components/scan-result";
import { PrivatePdfButton } from "@/components/private-pdf-button";
import { downloadPrivateReport } from "@/lib/private-report.functions";
import { openPdfPreview, openPrivatePdf } from "@/lib/private-report";
import { renderReportPdfPreview } from "@/lib/report-pdf";
import { reportAccessQuery, RestrictedReportSummary } from "@/components/restricted-report-summary";
import { useFeatureSettings } from "@/lib/use-feature-settings";
import { RULE_GROUP_LABELS } from "@/lib/rules/scoring";

export const Route = createFileRoute("/_authenticated/reports/$id")({
  validateSearch: z.object({ print: z.boolean().optional() }),
  head: () => ({
    meta: [
      { title: "Review Risk Report — Rating Guard Remix" },
      { name: "description", content: "Google review risk evidence report." },
    ],
  }),
  component: ReportDetail,
});

function ReportDetail() {
  const features = useFeatureSettings();
  const access = useQuery(reportAccessQuery());
  const { id } = Route.useParams();
  const { print } = Route.useSearch();
  const audit = useServerFn(logAudit);
  const savePdf = useServerFn(saveReportPdf);
  const privateDownload = useServerFn(downloadPrivateReport);
  const sendEmail = useServerFn(emailReport);
  const emailStatus = useServerFn(reportEmailStatus);
  const { data: smtp, error: smtpError } = useQuery({
    queryKey: ["report-email-status"],
    queryFn: () => emailStatus(),
  });
  const [clientEmail, setClientEmail] = useState("");
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();
  const { data, isLoading, error: queryError } = useQuery(scanQuery(id));
  const articleRef = useRef<HTMLElement>(null);
  const [exporting, setExporting] = useState(false);

  const printReport = useCallback(() => {
    if (!data?.scan || !data.report || data.scan.status !== "complete") return;
    window.print();
  }, [data]);

  async function download() {
    if (
      !data?.scan ||
      !data.report ||
      data.scan.status !== "complete" ||
      !articleRef.current ||
      exporting
    )
      return;
    const preview = window.open("about:blank", "_blank");
    if (!preview) {
      toast.error("Allow pop-ups to preview this PDF. No file was downloaded.");
      return;
    }
    setExporting(true);
    try {
      if (data.scan.is_seed) {
        openPdfPreview(await renderReportPdfPreview(articleRef.current), preview);
        return;
      }
      const existing = savedPdfUrl(data.report.report_data);
      if (!existing)
        await savePdf({
          data: { scanId: id },
        });
      await queryClient.invalidateQueries({ queryKey: ["scan", id] });
      openPrivatePdf(await privateDownload({ data: { scanId: id, variant: "full" } }), preview);
      if (!data.scan.is_seed)
        await audit({ data: { action: "report.previewed", detail: { scan_id: id } } }).catch(
          (error: unknown) => {
            console.error("[report] Could not record PDF export action", error);
            toast.error("PDF generated, but its audit entry could not be saved.");
          },
        );
    } catch (error) {
      preview.close();
      console.error("[report] PDF export failed", error);
      toast.error(error instanceof Error ? error.message : "Could not generate the report PDF.");
    } finally {
      setExporting(false);
    }
  }
  useEffect(() => {
    if (!print || !data?.scan || !data.report || data.scan.status !== "complete") return undefined;
    const t = setTimeout(printReport, 400);
    return () => clearTimeout(t);
  }, [print, data, printReport]);

  if (access.error)
    return <p role="alert">Could not verify report access: {access.error.message}</p>;
  if (access.data && access.data !== "super_admin") return <RestrictedReportSummary scanId={id} />;
  if (isLoading || access.isPending)
    return <div className="text-muted-foreground">Preparing report…</div>;
  if (queryError) return <p role="alert">Could not load report: {queryError.message}</p>;
  if (!data?.scan)
    return (
      <div>
        Access Denied: this report is private or unavailable.{" "}
        <Link to="/reports" className="text-brand">
          Back to reports
        </Link>
      </div>
    );
  if (!data.report || data.scan.status !== "complete")
    return (
      <div role="alert">
        This scan does not have a completed saved report. {data.scan.error}{" "}
        <Link to="/scan" className="text-brand">
          Return to scanning
        </Link>
      </div>
    );
  const { scan, reviews, report } = data;
  const flagged = reviews.filter(isFlagged);
  const analyzed = reviews.filter((r) => r.analysis).length;
  const ruleRechecks = reviews.flatMap((review) =>
    review.analysis?.microRuleRecheck ? [review.analysis.microRuleRecheck.score] : [],
  );
  const ruleCheckTotals = ruleRechecks.reduce(
    (totals, score) => ({
      run: totals.run + score.checksRun,
      assessed: totals.assessed + score.checksAssessed,
      flagged: totals.flagged + score.checksFlagged,
    }),
    { run: 0, assessed: 0, flagged: 0 },
  );
  const pdfUrl = savedPdfUrl(report.report_data);
  async function copyLink() {
    if (!pdfUrl) return;
    try {
      await navigator.clipboard.writeText(`https://ratingguard.online/reports/${id}`);
      toast.success("Private report link copied. Authorized login required.");
    } catch (error) {
      console.error("[report] Link copy failed", error);
      toast.error("Could not copy the link. Copy the displayed PDF URL manually.");
    }
  }
  async function submitEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      await sendEmail({ data: { scanId: id, email: clientEmail } });
      toast.success("SMTP server accepted the email. Inbox delivery is not yet confirmed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send report email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="no-print mb-6 flex flex-wrap justify-between gap-3">
        <span className="rounded-full border px-3 py-1 text-xs font-semibold">Private Report</span>
        <Button variant="ghost" asChild>
          <Link to="/reports">
            <ArrowLeft /> Reports
          </Link>
        </Button>
        <div className="flex gap-2">
          {pdfUrl ? (
            <PrivatePdfButton scanId={id}>
              <Download /> Preview PDF
            </PrivatePdfButton>
          ) : (
            <Button variant="outline" onClick={download} disabled={exporting}>
              <Download /> {exporting ? "Preparing PDF..." : "Preview PDF"}
            </Button>
          )}
          <Button variant="outline" onClick={printReport}>
            Print report
          </Button>
          {pdfUrl && (
            <>
              <Button variant="outline" onClick={copyLink}>
                Copy Link
              </Button>
              {features.data?.whatsapp_share_enabled && (
                <Button variant="outline" asChild>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`Your Rating Guard private report (authorized login required): https://ratingguard.online/reports/${id}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    WhatsApp
                  </a>
                </Button>
              )}
            </>
          )}
          {!scan.is_seed && (
            <Button variant="outline" asChild>
              <a
                href={scan.maps_uri?.trim() || scan.source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on Google Maps
              </a>
            </Button>
          )}
          {!scan.is_seed && (
            <Button asChild>
              <a
                href={
                  flagged.find((review) => review.review_uri)?.review_uri ??
                  scan.maps_uri?.trim() ??
                  scan.source_url
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                <Flag /> Open flagged review in Google Maps
              </a>
            </Button>
          )}
        </div>
        {!scan.is_seed && (
          <p className="no-print mb-4 text-sm text-muted-foreground">
            Private Report — only Super Admin (theratingguard@gmail.com) can view details and PDFs.
            All other accounts, including report owners, have summary-only access.
          </p>
        )}
      </div>
      {!scan.is_seed && (
        <section className="no-print surface mb-6 p-4">
          <p>PDF Status: {pdfUrl ? "Ready" : "Not available or expired; preview to regenerate"}</p>
          <p className="text-xs text-muted-foreground">
            Emailing an attachment shares a confidential copy outside this access control; that copy
            cannot be revoked.
          </p>
          {pdfUrl && (
            <p className="break-all text-sm">
              https://ratingguard.online/reports/{id} — authorized login required
            </p>
          )}
          {features.data?.email_share_enabled && (
            <form onSubmit={submitEmail} className="mt-3 flex flex-wrap items-center gap-2">
              <label htmlFor="report-email">Email Report</label>
              <Input
                id="report-email"
                type="email"
                required
                value={clientEmail}
                onChange={(event) => setClientEmail(event.target.value)}
                placeholder="Client email"
                className="max-w-xs"
                disabled={sending}
              />
              <Button type="submit" disabled={!pdfUrl || !smtp?.configured || sending}>
                {sending ? "Sending..." : "Send Email"}
              </Button>
            </form>
          )}
          {smtpError && (
            <p role="alert">Could not verify email availability: {smtpError.message}</p>
          )}
          {smtp && !smtp.configured && (
            <p className="mt-2 text-sm text-muted-foreground">
              Email sharing is not configured. A verified SMTP App Password or provider credential
              is required.
            </p>
          )}
        </section>
      )}
      <article ref={articleRef} className="surface mx-auto max-w-4xl p-8 sm:p-12">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
          <div>
            <div className="text-xs font-bold tracking-[0.25em] text-brand">EVIDENCE REPORT</div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Google Review Risk Report</h1>
            {scan.is_seed && (
              <div className="mt-2">
                <SeedBadge />
              </div>
            )}
          </div>
          <div className="text-right font-mono text-xs text-muted-foreground">
            {reportNumber(scan, report)}
            <br />
            {fmtDate(report?.created_at ?? scan.created_at)}
          </div>
        </header>
        <dl className="grid gap-4 py-6 text-sm sm:grid-cols-2">
          <Item k="Business name" v={scan.business_name ?? "—"} />
          <Item
            k="Business rating"
            v={
              <span className="flex items-center gap-2">
                <span className="font-mono">
                  {scan.rating != null ? Number(scan.rating).toFixed(1) : "—"}
                </span>
                {scan.rating != null && <Stars value={Number(scan.rating)} />}
              </span>
            }
          />
          <Item k="Total Google reviews" v={scan.total_reviews?.toLocaleString() ?? "—"} />
          <Item k="Scan date" v={fmtDate(scan.created_at)} />
          <Item
            k="Google Maps"
            v={
              scan.maps_uri ? (
                <a href={scan.maps_uri} className="break-all text-brand">
                  {scan.maps_uri}
                </a>
              ) : (
                <span className="break-all">{scan.source_url}</span>
              )
            }
          />
        </dl>
        <section className="border-t py-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Summary
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(
              [
                ["Reviews retrieved", scan.reviews_retrieved, ""],
                ["Reviews analyzed", analyzed, ""],
                ["High risk", scan.high_count, "text-risk-high"],
                ["Medium risk", scan.medium_count, "text-risk-medium"],
                ["Normal", scan.normal_count, "text-risk-normal"],
                ["Requires review", scan.requires_review_count, "text-muted-foreground"],
              ] as const
            ).map(([l, v, c]) => (
              <div key={l} className="rounded-lg bg-muted p-4">
                <div className="text-xs text-muted-foreground">{l}</div>
                <div className={`font-mono text-2xl font-semibold ${c}`}>{v}</div>
              </div>
            ))}
          </div>
          {ruleRechecks.length > 0 && (
            <div className="mt-4 rounded-lg border p-4">
              <div className="text-sm font-semibold">Retrospective local rules recheck</div>
              <p className="mt-1 text-sm">
                {ruleRechecks.length} reviews · {ruleCheckTotals.run} checks run ·{" "}
                {ruleCheckTotals.assessed} assessed · {ruleCheckTotals.flagged} signals
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                500 checks are evaluated per analyzed review. This recheck uses only the review text
                and same-scan review history available now; it does not alter the saved AI verdict.
                Checks requiring unavailable profile, biometric, network, or event data remain
                unassessed.
              </p>
            </div>
          )}
          {!scan.is_seed && (
            <p className="mt-3 text-xs text-muted-foreground">
              Source: Google Places API (New). Google provides up to 5 reviews per business through
              its official API; these are the available reviews, not all reviews.
            </p>
          )}
        </section>
        <RatingAnalysis scan={scan} reviews={reviews} />
        <RemovalSummary metadata={report.report_data} total={reviews.length} />
        {ruleRechecks.length > 0 && (
          <section className="border-t py-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Retrospective rules recheck by review
            </h2>
            <p className="mt-2 text-xs text-muted-foreground">
              Recomputed locally from this report's available review text and same-scan history.
              These results were not part of the original saved AI verdict and are not proof of a
              policy violation.
            </p>
            <div className="mt-4 space-y-3">
              {reviews.flatMap((review) => {
                const recheck = review.analysis?.microRuleRecheck;
                if (!recheck) return [];
                const triggered = recheck.checks.filter((check) => check.status === "flagged");
                return [
                  <article key={review.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium">
                        {review.author} · {review.rating}/5
                      </span>
                      <span>
                        {recheck.score.checksAssessed}/{recheck.score.checksRun} assessed ·{" "}
                        {triggered.length} signals
                      </span>
                    </div>
                    {triggered.length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {triggered.map((check) => (
                          <li key={check.id} className="text-xs">
                            <span className="font-medium">
                              {RULE_GROUP_LABELS[check.group]} · {check.id}
                            </span>
                            {check.evidence && (
                              <span className="text-muted-foreground"> — {check.evidence}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        No retrospective rule signals. Checks requiring unavailable data remain
                        unassessed.
                      </p>
                    )}
                  </article>,
                ];
              })}
            </div>
          </section>
        )}
        <section className="border-t py-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Flagged review details ({flagged.length})
          </h2>
          {flagged.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              {scan.requires_review_count > 0 || analyzed !== reviews.length
                ? "Some reviews need further review or have not been analyzed. No clean-result conclusion is available."
                : "No potentially risky reviews were found among the analyzed available reviews."}
            </p>
          )}
          <div className="mt-4 space-y-4">
            {flagged.map((r) => (
              <div key={r.id} className="break-inside-avoid rounded-xl border p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3 text-sm">
                    <b>{r.author}</b>
                    <Stars value={r.rating} size={12} />
                    <span className="text-muted-foreground">
                      {r.relative_time ?? fmtDate(r.published_at)}
                    </span>
                  </div>
                  <RiskBadge risk={riskOf(r)} />
                </div>
                <p className="mt-3 text-[15px] leading-relaxed">{r.text}</p>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <Item k="Risk category" v={r.analysis?.category ?? "—"} />
                  <Item
                    k="Confidence"
                    v={<span className="font-mono">{r.analysis?.confidence ?? 0}%</span>}
                  />
                  <Item k="Reason" v={r.analysis?.reason ?? "—"} />
                  <Item k="Evidence" v={r.analysis?.evidence ?? "—"} />
                  <Item
                    k="Google review link"
                    v={
                      r.review_uri ? (
                        <a href={r.review_uri} className="break-all text-brand">
                          {r.review_uri}
                        </a>
                      ) : (
                        "Not available"
                      )
                    }
                  />
                </dl>
              </div>
            ))}
          </div>
        </section>
        <section className="border-t py-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Recommended action
          </h2>
          <p className="mt-3 text-sm">
            {flagged.length === 0 && (scan.requires_review_count > 0 || analyzed !== reviews.length)
              ? "Manually assess the unresolved reviews. No clean-result conclusion or reporting recommendation is available until they are reviewed."
              : report?.recommended_action?.includes("official Google reporting path")
                ? `Review the ${flagged.length} flagged review(s) and verify the evidence. Rating Guard uses Google Places API for review data and cannot submit reports; open flagged reviews in Google Maps to check for any available manual reporting option.`
                : (report?.recommended_action ??
                  "Review flagged items and open them in Google Maps for manual review.")}
          </p>
          <h2 className="mt-6 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Google Maps reporting
          </h2>
          <p className="mt-2 text-sm">
            Rating Guard uses Google Places API to retrieve public review data; it cannot submit a
            report or verify Google&apos;s decision. Open the specific review in Google Maps and use
            its available reporting options.
          </p>
          <p className="mt-2 break-all text-sm">
            <a href={scan.maps_uri?.trim() || scan.source_url} className="text-brand">
              Open {scan.business_name ?? "business"} in Google Maps
            </a>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            This report has not been submitted to Google. Submission happens only through Google's
            own tools.
          </p>
        </section>
        <footer className="border-t pt-6 text-xs text-muted-foreground">
          <p className="font-semibold">CONFIDENTIAL — For Super Admin Only</p>
          Classification is automated and advisory; it does not guarantee a policy violation. Google
          independently determines whether a review violates its policies and whether removal is
          appropriate.
        </footer>
      </article>
      {features.data?.legal_expert_enabled && features.data.gpt_enabled && (
        <ReviewSelection key={scan.id} scan={scan} reviews={reviews} report={report} />
      )}
      <LegalAnalysisPanel scan={scan} reviews={reviews} report={report} />
      <ScanTimeline scanId={scan.id} isSeed={!!scan.is_seed} />
    </>
  );
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt>
      <dd className="mt-1">{v}</dd>
    </div>
  );
}
