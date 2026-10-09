import { OperationsPanel } from "@/components/ops-panels";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { scansQuery, scanRisk, fmtDate, riskyCount } from "@/lib/data";
import { PageHeader, EmptyState, StatusPill } from "@/components/app-shell";
import { Stars, RiskBadge, DevTag, ratingTone } from "@/components/review-ui";
import { Button } from "@/components/ui/button";
import shield from "@/assets/icon-shield.png";
import scanIcon from "@/assets/icon-scan.png";
import reportIcon from "@/assets/icon-report.png";
import alertIcon from "@/assets/icon-alert.png";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — The Rating Guard" }, { name: "description", content: "Overview of Google review scans and risk." }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: scans = [], isLoading } = useQuery(scansQuery());
  const done = scans.filter((s) => s.status === "complete");
  const sum = (k: "high_count" | "medium_count" | "normal_count" | "requires_review_count") => done.reduce((a, s) => a + s[k], 0);
  const high = sum("high_count"), med = sum("medium_count"), norm = sum("normal_count"), req = sum("requires_review_count");
  const total = high + med + norm + req;
  const kpis = [
    { label: "Total Scans", value: scans.length, img: scanIcon },
    { label: "Businesses Scanned", value: new Set(done.map((s) => s.business_id ?? s.business_name)).size, img: shield },
    { label: "Reviews Analyzed", value: total, img: reportIcon },
    { label: "Potentially Risky Reviews", value: high + med, accent: true, img: alertIcon },
  ];
  const rated = done.filter((s) => s.rating != null);
  const buckets = [
    { l: "4.5 – 5.0", n: rated.filter((s) => Number(s.rating) >= 4.5).length, c: "bg-risk-normal" },
    { l: "4.0 – 4.4", n: rated.filter((s) => Number(s.rating) >= 4 && Number(s.rating) < 4.5).length, c: "bg-risk-normal" },
    { l: "3.0 – 3.9", n: rated.filter((s) => Number(s.rating) >= 3 && Number(s.rating) < 4).length, c: "bg-risk-medium" },
    { l: "Below 3.0", n: rated.filter((s) => Number(s.rating) < 3).length, c: "bg-risk-high" },
  ];
  const avg = rated.length ? rated.reduce((a, s) => a + Number(s.rating), 0) / rated.length : null;

  return (
    <>
      <PageHeader title="Review Command Center" subtitle="Scan, analyze and report potentially policy-risk Google reviews."
        action={<Button asChild size="lg"><Link to="/scan"><Plus /> New Scan</Link></Button>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k, i) => (
          <div key={k.label} className="surface surface-hover group animate-rise relative overflow-hidden p-5" style={{ animationDelay: `${i * 60}ms` }}>
            <img src={k.img} alt="" width={80} height={80} loading="lazy" className="icon-3d absolute -right-3 -top-3 w-20 opacity-90 group-hover:-translate-y-1 group-hover:rotate-6" />
            <div className="text-sm text-muted-foreground">{k.label}</div>
            <div className={`mt-2 font-mono text-3xl font-semibold tabular ${k.accent ? "text-risk-high" : ""}`}>{isLoading ? "—" : k.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-semibold">Recent scans</h2>
            <Link to="/history" className="text-sm text-brand hover:underline">View all</Link>
          </div>
          {!isLoading && scans.length === 0 ? (
            <div className="p-6"><EmptyState title="No scans yet." action={<Button asChild><Link to="/scan">Start first scan</Link></Button>} /></div>
          ) : (
            <div
              className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
              tabIndex={0}
              role="region"
              aria-label="Recent scans table — horizontally scrollable"
            >
              <table className="w-full min-w-[680px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>{["Business", "Google Rating", "Reviews Retrieved", "Risky Reviews", "Scan Date", "Status", ""].map((h, i) => <th key={i} className="px-5 py-3 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {scans.slice(0, 6).map((s) => (
                    <tr key={s.id} className="border-t hover:bg-muted/50">
                      <td className="min-w-[180px] px-5 py-3 font-medium">{s.business_name ?? <span className="text-muted-foreground">{s.source_url.slice(0, 40)}</span>}{s.is_seed && <DevTag />}</td>
                      <td className="px-5 py-3">{s.rating != null ? <span className="flex items-center gap-1.5"><span className={`font-mono ${ratingTone(Number(s.rating))}`}>{Number(s.rating).toFixed(1)}</span><Stars value={Number(s.rating)} size={12} /></span> : "—"}</td>
                      <td className="px-5 py-3 font-mono">{s.reviews_retrieved}</td>
                      <td className="px-5 py-3">{s.status === "complete" ? <span className="flex items-center gap-2"><span className="font-mono">{riskyCount(s)}</span><RiskBadge risk={scanRisk(s)} /></span> : "—"}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">{fmtDate(s.created_at)}</td>
                      <td className="px-5 py-3"><StatusPill status={s.status} error={s.error} /></td>
                      <td className="px-5 py-3 text-right">{s.status === "complete" && <Link to="/reports/$id" params={{ id: s.id }} className="text-brand hover:underline">Open</Link>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {scans.length > 0 && (
            <div className="flex items-center justify-center gap-2 border-t px-5 py-2.5 text-xs text-muted-foreground sm:hidden" aria-hidden="true">
              <span>←</span>
              <span>Swipe to see all columns</span>
              <span>→</span>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="surface p-5">
            <h2 className="font-semibold">Risk overview</h2>
            <div className="mt-5 space-y-4">
              {([["High Risk", high, "bg-risk-high"], ["Medium Risk", med, "bg-risk-medium"], ["Normal", norm, "bg-risk-normal"]] as const).map(([l, v, c]) => (
                <div key={l}>
                  <div className="flex justify-between text-sm"><span>{l}</span><span className="font-mono">{v}</span></div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full ${c} transition-all duration-1000`} style={{ width: total ? `${(v / total) * 100}%` : "0%" }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="surface p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">Rating overview</h2>
              <span className="font-mono text-sm text-muted-foreground">avg {avg?.toFixed(1) ?? "—"}</span>
            </div>
            <div className="mt-4 flex h-24 items-end gap-3">
              {buckets.map((b) => {
                const max = Math.max(1, ...buckets.map((x) => x.n));
                return (
                  <div key={b.l} className="flex flex-1 flex-col items-center gap-1">
                    <span className="font-mono text-xs">{b.n}</span>
                    <div className={`w-full rounded-t-md ${b.c} transition-all duration-1000`} style={{ height: `${(b.n / max) * 64 + 4}px` }} />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex gap-3 text-center text-[10px] text-muted-foreground">{buckets.map((b) => <span key={b.l} className="flex-1">{b.l}</span>)}</div>
          </section>
        </div>
      </div>
      <OperationsPanel />
    </>
  );
}
