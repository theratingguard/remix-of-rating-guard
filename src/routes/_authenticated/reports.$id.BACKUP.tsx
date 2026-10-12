import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ArrowLeft, Download } from "lucide-react";
import { scanQuery, fmtDate, reportNumber, savedPdfUrl } from "@/lib/data";
import { logAudit } from "@/lib/scan.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadReportPdf } from "@/lib/report-pdf";
import { saveReportPdf } from "@/lib/report-pdf.functions";
import { LegalAnalysisPanel } from "@/components/legal-analysis";
import { PrivatePdfButton } from "@/components/private-pdf-button";
import { downloadPrivateReport } from "@/lib/private-report.functions";
import { savePrivatePdf } from "@/lib/private-report";
import { reportAccessQuery, RestrictedReportSummary } from "@/components/restricted-report-summary";

export const Route = createFileRoute("/_authenticated/reports/$id/BACKUP")({
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
  const access = useQuery(reportAccessQuery());
  const { id } = Route.useParams();
  const { print } = Route.useSearch();
  const audit = useServerFn(logAudit);
  const savePdf = useServerFn(saveReportPdf);
  const privateDownload = useServerFn(downloadPrivateReport);
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
    setExporting(true);
    try {
      if (data.scan.is_seed) {
        await downloadReportPdf(articleRef.current, `${reportNumber(data.scan, data.report)}.pdf`);
        return;
      }
      const existing = savedPdfUrl(data.report.report_data);
      if (!existing)
        await savePdf({
          data: { scanId: id },
        });
      await queryClient.invalidateQueries({ queryKey: ["scan", id] });
      savePrivatePdf(await privateDownload({ data: { scanId: id, variant: "full" } }));
      if (!data.scan.is_seed)
        await audit({ data: { action: "report.downloaded", detail: { scan_id: id } } }).catch(
          (error: unknown) => {
            console.error("[report] Could not record PDF export action", error);
            toast.error("PDF generated, but its audit entry could not be saved.");
          },
        );
    } catch (error) {
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
  const pdfUrl = savedPdfUrl(report.report_data);

  return (
    <>
      <div className="no-print mb-6 flex flex-wrap justify-between gap-3">
        <Button variant="ghost" asChild>
          <Link to="/reports">
            <ArrowLeft /> Reports
          </Link>
        </Button>
        <div className="flex gap-2">
          {pdfUrl ? (
            <PrivatePdfButton scanId={id}>
              <Download /> Save PDF
            </PrivatePdfButton>
          ) : (
            <Button variant="outline" onClick={download} disabled={exporting}>
              <Download /> {exporting ? "Preparing PDF..." : "Save PDF"}
            </Button>
          )}
          <Button variant="outline" onClick={printReport}>
            Print / Save PDF
          </Button>
        </div>
      </div>
      <article ref={articleRef} className="mx-auto max-w-4xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="surface flex-1 p-6">
            <h1 className="text-2xl font-bold tracking-tight">Scan Report</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {scan.business_name ?? "Business"} ·{" "}
              {scan.rating == null ? "—" : Number(scan.rating).toFixed(1)} ⭐ (
              {scan.total_reviews?.toLocaleString() ?? "—"} reviews, {reviews.length} fetched)
            </p>
          </div>
          <div className="px-2 text-right text-sm text-muted-foreground">
            {reportNumber(scan, report)} · {fmtDate(report?.created_at ?? scan.created_at)}
          </div>
        </header>
        <LegalAnalysisPanel scan={scan} reviews={reviews} report={report} />
      </article>
    </>
  );
}
