import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { scansQuery, scanRisk, fmtDate, riskyCount, analyzedCount } from "@/lib/data";
import { PageHeader, EmptyState, StatusPill } from "@/components/app-shell";
import { RiskBadge, DevTag } from "@/components/review-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "Scan History — The Rating Guard" }, { name: "description", content: "Searchable history of Google review scans." }] }),
  component: HistoryPage,
});

const sel = "h-9 rounded-md border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function HistoryPage() {
  const { data: scans = [], isLoading } = useQuery(scansQuery());
  const [q, setQ] = useState(""); const [risk, setRisk] = useState("all"); const [status, setStatus] = useState("all");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const rows = useMemo(() => scans.filter((s) => {
    if (q && !`${s.business_name ?? ""} ${s.source_url}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (status !== "all" && s.status !== status) return false;
    if (risk !== "all" && (s.status !== "complete" || scanRisk(s) !== risk)) return false;
    const d = s.created_at.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }), [scans, q, risk, status, from, to]);

  return (
    <>
      <PageHeader title="Scan History" subtitle="Every scan you've run." />
      <div className="surface mb-4 flex flex-wrap items-end gap-3 p-3">
        <label className="flex-1 min-w-48"><span className="sr-only">Search</span><Input placeholder="Search business name or URL…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="text-xs text-muted-foreground">From<input type="date" className={`${sel} ml-1`} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs text-muted-foreground">To<input type="date" className={`${sel} ml-1`} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label><span className="sr-only">Risk</span><select className={sel} value={risk} onChange={(e) => setRisk(e.target.value)}><option value="all">Any risk</option><option value="high">High</option><option value="medium">Medium</option><option value="requires_review">Requires review</option><option value="normal">Normal</option></select></label>
        <label><span className="sr-only">Status</span><select className={sel} value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Any status</option><option value="complete">Complete</option><option value="failed">Failed</option><option value="running">Running</option></select></label>
      </div>
      {!isLoading && scans.length === 0 ? <EmptyState title="No scans found." action={<Button asChild><Link to="/scan">Start first scan</Link></Button>} /> : (
        <div className="surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>{["Business", "Rating", "Reviews Retrieved", "Reviews Analyzed", "Risky Reviews", "Date", "Status", ""].map((h, i) => <th key={i} className="px-5 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t hover:bg-muted/50">
                  <td className="px-5 py-3 font-medium">{s.business_name ?? <span className="text-muted-foreground">{s.source_url.slice(0, 45)}</span>}{s.is_seed && <DevTag />}</td>
                  <td className="px-5 py-3 font-mono">{s.rating != null ? Number(s.rating).toFixed(1) : "—"}</td>
                  <td className="px-5 py-3 font-mono">{s.reviews_retrieved}</td>
                  <td className="px-5 py-3 font-mono">{analyzedCount(s)}</td>
                  <td className="px-5 py-3">{s.status === "complete" ? <span className="flex items-center gap-2"><span className="font-mono">{riskyCount(s)}</span><RiskBadge risk={scanRisk(s)} /></span> : "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{fmtDate(s.created_at)}</td>
                  <td className="px-5 py-3"><StatusPill status={s.status} error={s.error} />{s.status === "failed" && s.error && <div className="mt-1 max-w-56 text-xs text-muted-foreground">{s.error}</div>}</td>
                  <td className="px-5 py-3 text-right">{s.status === "complete" && <Link to="/reports/$id" params={{ id: s.id }} className="text-brand hover:underline">View</Link>}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">No scans found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
