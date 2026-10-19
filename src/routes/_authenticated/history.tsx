import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { scansQuery, scanRisk, riskyCount, analyzedCount, savedPdfUrl } from "@/lib/data";
import { compactDate, shortScanError, pageSlice } from "@/lib/operations-ui";
import { PageHeader, EmptyState, StatusPill } from "@/components/app-shell";
import { RiskBadge, DevTag } from "@/components/review-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { selectedPdfUrl } from "@/lib/review-selection";
import { savedLegalPdfUrl } from "@/lib/legal-analysis";
import { PrivatePdfButton } from "@/components/private-pdf-button";
import { RestrictedReportSummary } from "@/components/restricted-report-summary";
import { reportAccessQuery } from "@/lib/report-access";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Scan History — Rating Guard" },
      { name: "description", content: "Searchable history of Google review scans." },
    ],
  }),
  component: HistoryPage,
});

const sel =
  "h-9 rounded-md border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function HistoryPage() {
  const access = useQuery(reportAccessQuery());
  const { data: scans = [], isLoading, error } = useQuery(scansQuery());
  const [q, setQ] = useState("");
  const [risk, setRisk] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const rows = useMemo(
    () =>
      scans.filter((s) => {
        if (
          q &&
          !`${s.business_name ?? ""} ${s.source_url} ${s.error ?? ""} ${s.id} ${s.reports?.report_number ?? ""}`
            .toLowerCase()
            .includes(q.toLowerCase())
        )
          return false;
        if (status !== "all" && s.status !== status) return false;
        if (risk !== "all" && (s.status !== "complete" || scanRisk(s) !== risk)) return false;
        const d = s.created_at.slice(0, 10);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      }),
    [scans, q, risk, status, from, to],
  );
  const paging = pageSlice(rows, page);

  if (access.error)
    return <p role="alert">Could not verify report access: {access.error.message}</p>;
  if (access.data && access.data !== "super_admin") return <RestrictedReportSummary />;
  if (access.isPending) return <p>Verifying report access…</p>;
  if (error) return <p role="alert">Could not load scan history: {error.message}</p>;
  return (
    <>
      <PageHeader title="Scan History" subtitle="Every scan you've run." />
      <div className="surface mb-4 flex flex-wrap items-end gap-3 p-3">
        <label className="flex-1 min-w-48">
          <span className="sr-only">Search</span>
          <Input
            placeholder="Search business, URL, scan ID or error…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          From
          <input
            type="date"
            className={`${sel} ml-1`}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          To
          <input
            type="date"
            className={`${sel} ml-1`}
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          <span className="sr-only">Risk</span>
          <select
            className={sel}
            value={risk}
            onChange={(e) => {
              setRisk(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Any risk</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="requires_review">Requires review</option>
            <option value="normal">Normal</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Status</span>
          <select
            className={sel}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Any status</option>
            <option value="complete">Complete</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
          </select>
        </label>
        <Button
          variant="outline"
          onClick={() => {
            setQ("");
            setRisk("all");
            setStatus("all");
            setFrom("");
            setTo("");
            setPage(1);
          }}
        >
          Reset filters
        </Button>
      </div>
      {!isLoading && scans.length === 0 ? (
        <EmptyState
          title="No scans found."
          action={
            <Button asChild>
              <Link to="/scan">Start first scan</Link>
            </Button>
          }
        />
      ) : (
        <div className="surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {[
                  "Business",
                  "Rating",
                  "Reviews Retrieved",
                  "Reviews Analyzed",
                  "Risky Reviews",
                  "Date",
                  "Status",
                  "",
                ].map((h, i) => (
                  <th key={i} className="px-5 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paging.rows.map((s) => (
                <tr key={s.id} className="border-t hover:bg-muted/50">
                  <td className="px-5 py-3 font-medium">
                    {s.business_name ?? (
                      <span className="text-muted-foreground">{s.source_url.slice(0, 45)}</span>
                    )}
                    {s.is_seed && <DevTag />}
                  </td>
                  <td className="px-5 py-3 font-mono">
                    {s.rating != null ? Number(s.rating).toFixed(1) : "—"}
                  </td>
                  <td className="px-5 py-3 font-mono">{s.reviews_retrieved}</td>
                  <td className="px-5 py-3 font-mono">{analyzedCount(s)}</td>
                  <td className="px-5 py-3">
                    {s.status === "complete" ? (
                      <span className="flex items-center gap-2">
                        <span className="font-mono">{riskyCount(s)}</span>
                        <RiskBadge risk={scanRisk(s)} />
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
                    {compactDate(s.created_at)}
                  </td>
                  <td className="px-5 py-3">
                    <StatusPill status={s.status} error={s.error} />
                    {s.status === "failed" && s.error && (
                      <div
                        title={s.error}
                        className="mt-1 max-w-56 truncate text-sm text-muted-foreground"
                      >
                        {shortScanError(s.error)}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {s.status === "complete" && savedLegalPdfUrl(s.reports?.report_data) && (
                      <PrivatePdfButton scanId={s.id} variant="legal">
                        Legal PDF
                      </PrivatePdfButton>
                    )}
                    {s.status === "complete" && selectedPdfUrl(s.reports?.report_data) && (
                      <PrivatePdfButton scanId={s.id} variant="selected">
                        Selected PDF
                      </PrivatePdfButton>
                    )}
                    {s.status === "complete" && savedPdfUrl(s.reports?.report_data) && (
                      <PrivatePdfButton scanId={s.id}>PDF</PrivatePdfButton>
                    )}
                    {s.status === "complete" && (
                      <Link
                        to="/reports/$id"
                        params={{ id: s.id }}
                        className="text-brand hover:underline"
                      >
                        View
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                    No scans found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="flex items-center justify-between gap-3 border-t p-4 text-sm">
            <span>
              {rows.length} matching scans · Page {paging.page}/{paging.pages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={paging.page === 1}
                onClick={() => setPage(paging.page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={paging.page === paging.pages}
                onClick={() => setPage(paging.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
