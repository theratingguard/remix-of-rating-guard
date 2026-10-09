import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import {
  getOperations, getActionCenter, setActionStatus, getQualityCenter, getErrorCenter, setErrorStatus, getSystemQuality, getScanEvents,
} from "@/lib/ops.functions";
import { ACTION_STATUSES, ACTION_LABEL, recommend, type ActionStatus } from "@/lib/actions";
import { fmtDate } from "@/lib/data";
import { RiskBadge, DevTag, Confidence } from "@/components/review-ui";
import { Input } from "@/components/ui/input";

const Kpi = ({ l, v, tone }: { l: string; v: React.ReactNode; tone?: string }) => (
  <div className="surface p-4"><div className="text-xs text-muted-foreground">{l}</div><div className={`mt-1 font-mono text-2xl font-semibold ${tone ?? ""}`}>{v}</div></div>
);
const dur = (ms: number | null) => (ms == null ? "—" : ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60_000)} min`);
const Th = ({ cols }: { cols: string[] }) => (
  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground"><tr>{cols.map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>)}</tr></thead>
);
const Loading = () => <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
const Fail = ({ e }: { e: unknown }) => <div className="p-6 text-sm text-risk-high">Couldn't load: {(e as Error)?.message ?? "unknown error"}</div>;

/** Dashboard: Scan Operations / Tracking */
export function OperationsPanel() {
  const fn = useServerFn(getOperations);
  const q = useQuery({ queryKey: ["ops"], queryFn: () => fn(), refetchInterval: (qq) => (qq.state.data?.kpi.running ? 4000 : false) });
  if (q.isLoading) return <section className="surface mt-6"><Loading /></section>;
  if (q.error || !q.data) return <section className="surface mt-6"><Fail e={q.error} /></section>;
  const k = q.data.kpi;
  return (
    <section className="mt-6">
      <h2 className="mb-3 font-semibold">Scan operations</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Kpi l="Total scans" v={k.total} /><Kpi l="Running" v={k.running} /><Kpi l="Completed" v={k.completed} tone="text-risk-normal" />
        <Kpi l="Partial" v={k.partial} tone="text-risk-medium" /><Kpi l="Failed" v={k.failed} tone="text-risk-high" />
        <Kpi l="Reviews retrieved" v={k.reviewsRetrieved} /><Kpi l="Reviews analyzed" v={k.reviewsAnalyzed} />
        <Kpi l="High risk" v={k.high} tone="text-risk-high" /><Kpi l="Medium risk" v={k.medium} tone="text-risk-medium" /><Kpi l="Normal" v={k.normal} tone="text-risk-normal" />
        <Kpi l="Rating mismatches" v={k.ratingMismatches} /><Kpi l="Google API failures" v={k.apiFailures} /><Kpi l="AI failures" v={k.aiFailures} />
      </div>
      <div className="surface mt-4 overflow-x-auto">
        <div className="border-b px-4 py-3 text-sm font-semibold">Live activity</div>
        <table className="w-full text-sm">
          <Th cols={["Scan ID", "Business", "Rating", "Reviews", "Risk", "Current stage", "Duration", "Status", ""]} />
          <tbody>
            {q.data.activity.length === 0 && <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">No scans yet.</td></tr>}
            {q.data.activity.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{s.id.slice(0, 8)}</td>
                <td className="min-w-[160px] px-4 py-2">{s.business_name ?? <span className="text-muted-foreground">{s.source_url.slice(0, 30)}</span>}{s.is_seed && <DevTag />}</td>
                <td className="px-4 py-2 font-mono">{s.rating != null ? Number(s.rating).toFixed(1) : "—"}{s.rating_mismatch && <span className="ml-1 text-xs text-risk-high">MISMATCH</span>}</td>
                <td className="px-4 py-2 font-mono">{s.reviews_retrieved}</td>
                <td className="px-4 py-2 font-mono text-xs"><span className="text-risk-high">{s.high_count}H</span> · <span className="text-risk-medium">{s.medium_count}M</span></td>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{s.currentStage}</td>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{dur(s.durationMs)}</td>
                <td className="px-4 py-2 text-xs font-semibold capitalize" title={s.error ?? ""}>{s.status}</td>
                <td className="px-4 py-2">{s.status === "complete" && <Link to="/reports/$id" params={{ id: s.id }} className="text-brand hover:underline">Open</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Report page: lifecycle timeline */
export function ScanTimeline({ scanId, isSeed }: { scanId: string; isSeed: boolean }) {
  const fn = useServerFn(getScanEvents);
  const q = useQuery({ queryKey: ["events", scanId], queryFn: () => fn({ data: { scanId } }) });
  return (
    <section className="surface no-print mt-6 p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Scan tracking</h2>
      {isSeed ? <p className="mt-2 text-sm text-muted-foreground">Development data — no real scan lifecycle was recorded.</p>
        : q.isLoading ? <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        : !q.data?.length ? <p className="mt-2 text-sm text-muted-foreground">No events recorded for this scan (it ran before tracking was added).</p>
        : <ol className="mt-3 space-y-2">{q.data.map((e, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-3 text-sm">
            <span className={`font-mono text-xs ${e.status === "error" ? "text-risk-high" : "text-risk-normal"}`}>●</span>
            <span className="font-mono text-xs font-semibold">{e.stage}</span>
            <span className="text-muted-foreground">{e.message}{e.error_code ? ` [${e.error_code}]` : ""}</span>
            <span className="ml-auto font-mono text-xs text-muted-foreground">{new Date(e.created_at).toLocaleTimeString()} · {dur(e.duration_ms)}</span>
          </li>))}</ol>}
    </section>
  );
}

/** Reports: Review Action Center */
export function ActionCenter() {
  const fn = useServerFn(getActionCenter);
  const save = useServerFn(setActionStatus);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["actions"], queryFn: () => fn() });
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const rows = useMemo(() => (q.data ?? []).filter((r) => (filter === "all" || r.status === filter) && (!search || `${r.business} ${r.reviewer} ${r.text}`.toLowerCase().includes(search.toLowerCase()))), [q.data, filter, search]);
  async function change(r: NonNullable<typeof q.data>[number], status: ActionStatus) {
    try { await save({ data: { reviewId: r.reviewId, scanId: r.scanId, status } }); toast.success("Action status saved"); qc.invalidateQueries({ queryKey: ["actions"] }); }
    catch (e) { toast.error((e as Error).message); }
  }
  if (q.isLoading) return <div className="surface"><Loading /></div>;
  if (q.error) return <div className="surface"><Fail e={q.error} /></div>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Potentially problematic reviews. These are AI-assisted flags, not Google decisions. Nothing here means Google has removed a review.</p>
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search business, reviewer or text" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" aria-label="Search flagged reviews" />
        <select aria-label="Filter by action status" className="rounded-md border bg-background px-3 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All statuses</option>{ACTION_STATUSES.map((s) => <option key={s} value={s}>{ACTION_LABEL[s]}</option>)}
        </select>
      </div>
      {rows.length === 0 && <div className="surface p-6 text-center text-sm text-muted-foreground">No flagged reviews match.</div>}
      {rows.map((r) => {
        const rec = recommend({ risk: r.risk, category: r.category, signals: r.signals, confidence: r.confidence, hasLink: !!r.reviewUrl });
        const v = r.verification as { agrees?: boolean; model?: string; reason?: string; error?: string } | null;
        return (
          <article key={r.reviewId} className="surface p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{r.business}</span>{r.isSeed && <DevTag />}
              {r.businessRating != null && <span className="font-mono text-xs text-muted-foreground">Google {Number(r.businessRating).toFixed(1)}★</span>}
              <span className="ml-auto"><RiskBadge risk={r.risk} /></span>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">{r.reviewer} · {r.reviewRating}★ {r.category && <>· {r.category}</>}</div>
            <p className="mt-2 text-sm">“{r.text || "(no text)"}”</p>
            <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
              <div><div className="text-xs font-semibold uppercase text-muted-foreground">{rec.kind}</div><p className="mt-1">{r.reason}</p>{r.evidence && <p className="mt-1 text-muted-foreground">Evidence: {r.evidence}</p>}<p className="mt-1 text-xs text-muted-foreground">{rec.why}</p></div>
              <div><div className="text-xs font-semibold uppercase text-muted-foreground">Recommended next action</div><p className="mt-1">{rec.next}</p>
                <div className="mt-2"><Confidence value={r.confidence} /></div>
                {v && <p className="mt-1 text-xs text-muted-foreground">Second model ({v.model}): {v.error ? `not available — ${v.error}` : v.agrees ? "agrees" : `disagrees — ${v.reason}`}</p>}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3">
              <label className="text-xs text-muted-foreground" htmlFor={`st-${r.reviewId}`}>Action status</label>
              <select id={`st-${r.reviewId}`} disabled={!r.editable} className="rounded-md border bg-background px-2 py-1 text-sm disabled:opacity-60" value={r.status} onChange={(e) => change(r, e.target.value as ActionStatus)}>
                {ACTION_STATUSES.map((s) => <option key={s} value={s}>{ACTION_LABEL[s]}</option>)}
              </select>
              {!r.editable && <span className="text-xs text-muted-foreground">Development data is read-only</span>}
              {r.reviewUrl && !r.isSeed && <a href={r.reviewUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-sm text-brand hover:underline">Open on Google <ExternalLink className="h-3.5 w-3.5" /></a>}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Bars({ data, k, label, tone }: { data: Record<string, any>[]; k: string; label: string; tone: string }) {
  const max = Math.max(1, ...data.map((d) => Number(d[k] ?? 0)));
  return (
    <div className="surface p-4">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      {data.length === 0 ? <div className="mt-3 text-xs text-muted-foreground">No data yet</div> : (
        <div className="mt-3 flex h-24 items-end gap-1">{data.map((d) => (
          <div key={d["date"]} className="flex flex-1 flex-col items-center" title={`${d["date"]}: ${d[k] ?? "—"}`}>
            <div className={`w-full rounded-t ${tone}`} style={{ height: `${(Number(d[k] ?? 0) / max) * 80 + 2}px` }} />
          </div>))}</div>)}
      {data.length > 0 && <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground"><span>{data[0]!["date"]}</span><span>{data[data.length - 1]!["date"]}</span></div>}
    </div>
  );
}

/** Reports: Reporting & Quality Center */
export function QualityCenter() {
  const fn = useServerFn(getQualityCenter);
  const q = useQuery({ queryKey: ["quality"], queryFn: () => fn() });
  if (q.isLoading) return <div className="surface"><Loading /></div>;
  if (q.error || !q.data) return <div className="surface"><Fail e={q.error} /></div>;
  const k = q.data.kpi;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Kpi l="Businesses scanned" v={k.businesses} /><Kpi l="Reviews retrieved" v={k.reviewsRetrieved} /><Kpi l="Reviews analyzed" v={k.reviewsAnalyzed} />
        <Kpi l="High risk" v={k.high} tone="text-risk-high" /><Kpi l="Medium risk" v={k.medium} tone="text-risk-medium" /><Kpi l="Normal" v={k.normal} tone="text-risk-normal" />
        <Kpi l="Potential policy risk" v={k.policyRisk} /><Kpi l="Actionable" v={k.actionable} /><Kpi l="Not actionable" v={k.notActionable} />
        <Kpi l="Reports generated" v={k.reports} /><Kpi l="Google review links" v={k.googleLinks} /><Kpi l="API failures" v={k.apiFailures} />
        <Kpi l="Analysis failures" v={k.analysisFailures} /><Kpi l="Data mismatches" v={k.mismatches} />
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Bars data={q.data.trend} k="scans" label="Scans over time" tone="bg-brand" />
        <Bars data={q.data.trend} k="high" label="High-risk trend" tone="bg-risk-high" />
        <Bars data={q.data.trend} k="avgRating" label="Average rating over time" tone="bg-risk-normal" />
        <Bars data={q.data.trend} k="failures" label="Failure trend" tone="bg-risk-medium" />
      </div>
      <div className="surface overflow-x-auto">
        <div className="border-b px-4 py-3 text-sm font-semibold">Review Health Score &amp; Data Quality <span className="font-normal text-muted-foreground">— internal scores, not official Google scores</span></div>
        <table className="w-full text-sm">
          <Th cols={["Business", "Google rating", "Review Health Score", "Data quality", "Why"]} />
          <tbody>
            {q.data.businesses.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No completed scans.</td></tr>}
            {q.data.businesses.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="px-4 py-2">{b.name}{b.isSeed && <DevTag />}</td>
                <td className="px-4 py-2 font-mono">{b.rating != null ? Number(b.rating).toFixed(1) : "—"}</td>
                <td className="px-4 py-2 font-mono">{b.health ?? "—"}</td>
                <td className="px-4 py-2 text-xs font-semibold">{b.quality ?? "Not graded"}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{b.reasons?.join("; ") || (b.isSeed ? "Development data is not graded" : "Scanned before grading was added")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = { OPEN: "text-risk-high", INVESTIGATING: "text-risk-medium", FIXING: "text-risk-medium", RETESTING: "text-risk-medium", FIXED: "text-brand", VERIFIED: "text-risk-normal", BLOCKED: "text-muted-foreground" };

/** Settings: System Error Center */
export function ErrorCenter() {
  const fn = useServerFn(getErrorCenter);
  const save = useServerFn(setErrorStatus);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["errors"], queryFn: () => fn() });
  async function change(id: string, status: "OPEN" | "INVESTIGATING" | "FIXED" | "VERIFIED") {
    try { await save({ data: { id, status } }); qc.invalidateQueries({ queryKey: ["errors"] }); } catch (e) { toast.error((e as Error).message); }
  }
  return (
    <section className="surface mt-6 overflow-x-auto">
      <div className="border-b px-5 py-4"><h2 className="font-semibold">System error center</h2><p className="text-xs text-muted-foreground">Every Google, AI, database and report failure from real scans is recorded here.</p></div>
      {q.isLoading ? <Loading /> : q.error ? <Fail e={q.error} /> : (
        <table className="w-full text-sm">
          <Th cols={["Error ID", "Time", "Module", "Route", "Scan", "Business", "Code", "Message", "Severity", "Status"]} />
          <tbody>
            {(q.data ?? []).length === 0 && <tr><td colSpan={10} className="px-4 py-6 text-center text-muted-foreground">No errors recorded.</td></tr>}
            {(q.data ?? []).map((e) => (
              <tr key={e.id} className="border-t align-top">
                <td className="px-4 py-2 font-mono text-xs">{e.id.slice(0, 8)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-xs">{fmtDate(e.created_at)}</td>
                <td className="px-4 py-2 text-xs">{e.module}</td><td className="px-4 py-2 text-xs">{e.route}</td>
                <td className="px-4 py-2 font-mono text-xs">{e.scan_id?.slice(0, 8) ?? "—"}</td>
                <td className="px-4 py-2 text-xs">{e.business ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs">{e.code}</td>
                <td className="min-w-[200px] px-4 py-2 text-xs">{e.message}</td>
                <td className="px-4 py-2 text-xs font-semibold">{e.severity}</td>
                <td className="px-4 py-2"><select aria-label="Error status" className={`rounded border bg-background px-1 text-xs font-semibold ${STATUS_TONE[e.status]}`} value={e.status} onChange={(ev) => change(e.id, ev.target.value as "OPEN")}>{["OPEN", "INVESTIGATING", "FIXED", "VERIFIED"].map((s) => <option key={s}>{s}</option>)}</select></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Settings: System Quality Dashboard + Debug Findings */
export function SystemQuality({ health }: { health: { name: string; status: string }[] | undefined }) {
  const fn = useServerFn(getSystemQuality);
  const q = useQuery({ queryKey: ["system-quality"], queryFn: () => fn() });
  const h = (n: string) => health?.find((c) => c.name === n)?.status;
  const label = (s: string | undefined) => (s === "healthy" ? "HEALTHY" : s === "warning" ? "WARNING" : s ? "CRITICAL" : "…");
  const tone = (s: string) => (s === "HEALTHY" ? "text-risk-normal" : s === "WARNING" ? "text-risk-medium" : "text-risk-high");
  if (q.isLoading) return <section className="surface mt-6"><Loading /></section>;
  if (q.error || !q.data) return <section className="surface mt-6"><Fail e={q.error} /></section>;
  const c = q.data.counts, r = q.data.rates;
  const statuses = health?.map((x) => x.status) ?? [];
  const sys = statuses.includes("unavailable") ? "CRITICAL" : statuses.includes("warning") ? "WARNING" : statuses.length ? "HEALTHY" : "…";
  const ready = c.critical > 0 || c.open > 0 ? "CRITICAL" : c.blocked > 0 || sys !== "HEALTHY" ? "WARNING" : "HEALTHY";
  const pct = (v: number | null) => (v == null ? "No live data" : `${v}%`);
  return (
    <section className="mt-6">
      <h2 className="mb-3 font-semibold">System quality</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi l="System health" v={sys} tone={tone(sys)} /><Kpi l="Production readiness" v={ready} tone={tone(ready)} />
        <Kpi l="Google API" v={label(h("Google API"))} tone={tone(label(h("Google API")))} /><Kpi l="Database" v={label(h("Database"))} tone={tone(label(h("Database")))} />
        <Kpi l="AI" v={label(h("AI service"))} tone={tone(label(h("AI service")))} /><Kpi l="Authentication" v={label(h("Authentication"))} tone={tone(label(h("Authentication")))} />
        <Kpi l="Open bugs" v={c.open} /><Kpi l="Critical" v={c.critical} tone={c.critical ? "text-risk-high" : ""} /><Kpi l="High" v={c.high} /><Kpi l="Medium" v={c.medium} />
        <Kpi l="Verified fixes" v={c.verified} tone="text-risk-normal" /><Kpi l="Blocked" v={c.blocked} />
        <Kpi l="Scan success" v={pct(r.scanSuccess)} /><Kpi l="Scan failure" v={pct(r.scanFailure)} /><Kpi l="Review processing" v={pct(r.reviewProcessing)} /><Kpi l="Report success" v={pct(r.reportSuccess)} />
      </div>
      <div className="surface mt-4 overflow-x-auto">
        <div className="border-b px-4 py-3 text-sm font-semibold">Debug findings</div>
        <table className="w-full text-sm">
          <Th cols={["ID", "Severity", "Module", "Description", "Root cause", "Fix", "Verification", "Status"]} />
          <tbody>{q.data.findings.map((f) => (
            <tr key={f.id} className="border-t align-top">
              <td className="px-4 py-2 font-mono text-xs">{f.finding_code}</td><td className="px-4 py-2 text-xs font-semibold">{f.severity}</td>
              <td className="px-4 py-2 text-xs">{f.module}</td><td className="min-w-[220px] px-4 py-2 text-xs">{f.description}</td>
              <td className="min-w-[180px] px-4 py-2 text-xs text-muted-foreground">{f.root_cause}</td><td className="min-w-[180px] px-4 py-2 text-xs">{f.fix}</td>
              <td className="min-w-[160px] px-4 py-2 text-xs text-muted-foreground">{f.verification}</td>
              <td className={`px-4 py-2 text-xs font-semibold ${STATUS_TONE[f.status]}`}>{f.status}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </section>
  );
}
