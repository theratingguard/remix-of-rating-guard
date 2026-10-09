import { ScanTimeline } from "@/components/ops-panels";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { z } from "zod";
import { ArrowLeft, Download, Flag } from "lucide-react";
import { scanQuery, fmtDate, reportNumber, GOOGLE_REPORT_URL, riskOf, isFlagged } from "@/lib/data";
import { logAudit } from "@/lib/scan.functions";
import { Stars, RiskBadge, SeedBadge } from "@/components/review-ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/reports/$id")({
  validateSearch: z.object({ print: z.boolean().optional() }),
  head: () => ({ meta: [{ title: "Review Risk Report — The Rating Guard" }, { name: "description", content: "Google review risk evidence report." }] }),
  component: ReportDetail,
});

function ReportDetail() {
  const { id } = Route.useParams();
  const { print } = Route.useSearch();
  const audit = useServerFn(logAudit);
  const { data, isLoading } = useQuery(scanQuery(id));

  function download() {
    if (data?.scan && !data.scan.is_seed) audit({ data: { action: "report.downloaded", detail: { scan_id: id } } }).catch(() => {});
    window.print();
  }
  useEffect(() => {
    if (!print || !data?.scan) return undefined;
    const t = setTimeout(download, 400);
    return () => clearTimeout(t);
  }, [print, data]);

  if (isLoading) return <div className="text-muted-foreground">Preparing report…</div>;
  if (!data?.scan) return <div>Report not found. <Link to="/reports" className="text-brand">Back to reports</Link></div>;
  const { scan, reviews, report } = data;
  const flagged = reviews.filter(isFlagged);
  const analyzed = reviews.filter((r) => r.analysis).length;

  return (
    <>
      <div className="no-print mb-6 flex flex-wrap justify-between gap-3">
        <Button variant="ghost" asChild><Link to="/reports"><ArrowLeft /> Reports</Link></Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={download}><Download /> Download PDF</Button>
          {!scan.is_seed && <Button asChild><a href={GOOGLE_REPORT_URL} target="_blank" rel="noreferrer"><Flag /> Open Google reporting path</a></Button>}
        </div>
      </div>
      <article className="surface mx-auto max-w-4xl p-8 sm:p-12">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
          <div>
            <div className="text-xs font-bold tracking-[0.25em] text-brand">EVIDENCE REPORT</div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Google Review Risk Report</h1>
            {scan.is_seed && <div className="mt-2"><SeedBadge /></div>}
          </div>
          <div className="text-right font-mono text-xs text-muted-foreground">{reportNumber(scan, report)}<br />{fmtDate(report?.created_at ?? scan.created_at)}</div>
        </header>
        <dl className="grid gap-4 py-6 text-sm sm:grid-cols-2">
          <Item k="Business name" v={scan.business_name ?? "—"} />
          <Item k="Business rating" v={<span className="flex items-center gap-2"><span className="font-mono">{scan.rating != null ? Number(scan.rating).toFixed(1) : "—"}</span>{scan.rating != null && <Stars value={Number(scan.rating)} />}</span>} />
          <Item k="Total Google reviews" v={scan.total_reviews?.toLocaleString() ?? "—"} />
          <Item k="Scan date" v={fmtDate(scan.created_at)} />
          <Item k="Google Maps" v={scan.maps_uri ? <a href={scan.maps_uri} className="break-all text-brand">{scan.maps_uri}</a> : <span className="break-all">{scan.source_url}</span>} />
        </dl>
        <section className="border-t py-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Summary</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {([["Reviews retrieved", scan.reviews_retrieved, ""], ["Reviews analyzed", analyzed, ""], ["High risk", scan.high_count, "text-risk-high"], ["Medium risk", scan.medium_count, "text-risk-medium"], ["Normal", scan.normal_count, "text-risk-normal"]] as const).map(([l, v, c]) => (
              <div key={l} className="rounded-lg bg-muted p-4"><div className="text-xs text-muted-foreground">{l}</div><div className={`font-mono text-2xl font-semibold ${c}`}>{v}</div></div>
            ))}
          </div>
          {!scan.is_seed && <p className="mt-3 text-xs text-muted-foreground">Source: Google Places API (New). Google provides up to 5 reviews per business through its official API; these are the available reviews, not all reviews.</p>}
        </section>
        <section className="border-t py-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Flagged review details ({flagged.length})</h2>
          {flagged.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No potentially risky reviews were found among the available reviews.</p>}
          <div className="mt-4 space-y-4">
            {flagged.map((r) => (
              <div key={r.id} className="break-inside-avoid rounded-xl border p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3 text-sm"><b>{r.author}</b><Stars value={r.rating} size={12} /><span className="text-muted-foreground">{r.relative_time ?? fmtDate(r.published_at)}</span></div>
                  <RiskBadge risk={riskOf(r)} />
                </div>
                <p className="mt-3 text-[15px] leading-relaxed">{r.text}</p>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <Item k="Risk category" v={r.analysis?.category ?? "—"} />
                  <Item k="Confidence" v={<span className="font-mono">{r.analysis?.confidence ?? 0}%</span>} />
                  <Item k="Reason" v={r.analysis?.reason ?? "—"} />
                  <Item k="Evidence" v={r.analysis?.evidence ?? "—"} />
                  <Item k="Google review link" v={r.review_uri ? <a href={r.review_uri} className="break-all text-brand">{r.review_uri}</a> : "Not available"} />
                </dl>
              </div>
            ))}
          </div>
        </section>
        <section className="border-t py-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Recommended action</h2>
          <p className="mt-3 text-sm">{report?.recommended_action ?? "Review flagged items and use the official Google reporting path where appropriate."}</p>
          <h2 className="mt-6 text-sm font-bold uppercase tracking-wider text-muted-foreground">Official Google reporting path</h2>
          <p className="mt-2 break-all text-sm"><a href={GOOGLE_REPORT_URL} className="text-brand">{GOOGLE_REPORT_URL}</a></p>
          <p className="mt-1 text-xs text-muted-foreground">This report has not been submitted to Google. Submission happens only through Google's own tools.</p>
        </section>
        <footer className="border-t pt-6 text-xs text-muted-foreground">
          Classification is automated and advisory; it does not guarantee a policy violation. Google independently determines whether a review violates its policies and whether removal is appropriate.
        </footer>
      </article>
      <ScanTimeline scanId={scan.id} isSeed={!!scan.is_seed} />
    </>
  );
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt><dd className="mt-1">{v}</dd></div>;
}
