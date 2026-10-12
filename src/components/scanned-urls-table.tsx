import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download, ExternalLink, RefreshCw, Search } from "lucide-react";
import type { ScanRow } from "@/lib/data";
import { scanRisk } from "@/lib/data";
import { exportScansCsv } from "@/lib/scan-csv";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/app-shell";

type RiskFilter = "all" | "high" | "medium" | "normal" | "requires_review";
const PAGE_SIZES = [10, 25, 50] as const;

export function ScannedUrlsTable({
  scans,
  search,
  location,
  risk,
  onRiskFilterChange,
  onRefresh,
  isRefreshing,
}: {
  scans: ScanRow[];
  search: string;
  location: string;
  risk: RiskFilter;
  onRiskFilterChange: (risk: RiskFilter) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const [status, setStatus] = useState("all");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [page, setPage] = useState(1);
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return scans.filter((scan) => {
      const searchable = [
        scan.business_name ?? "",
        scan.source_url,
        scan.id,
        scan.reports?.report_number ?? "",
        scan.address ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (query && !searchable.includes(query)) return false;
      if (location && scan.address !== location) return false;
      if (status !== "all" && scan.status !== status) return false;
      if (risk !== "all" && (scan.status !== "complete" || scanRisk(scan) !== risk)) return false;
      return true;
    });
  }, [scans, search, location, status, risk]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const first = rows.length ? (currentPage - 1) * pageSize + 1 : 0;
  const last = Math.min(currentPage * pageSize, rows.length);

  function updateRisk(value: string) {
    onRiskFilterChange(value as RiskFilter);
    setPage(1);
  }

  return (
    <section className="surface overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
        <div>
          <h2 className="font-semibold">All scanned URLs</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Risk summaries are classifications from available review data, not proof of violations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="relative">
            <span className="sr-only">Filter by risk level</span>
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <select
              aria-label="All risk levels"
              value={risk}
              onChange={(event) => updateRisk(event.target.value)}
              className="h-9 rounded-lg border bg-background pl-8 pr-3 text-xs"
            >
              <option value="all">All risk levels</option>
              <option value="high">High risk</option>
              <option value="medium">Medium risk</option>
              <option value="normal">Low risk</option>
              <option value="requires_review">Needs review</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <select
              aria-label="All statuses"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="h-9 rounded-lg border bg-background px-3 text-xs"
            >
              <option value="all">All statuses</option>
              <option value="complete">Complete</option>
              <option value="running">Running</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportScansCsv(rows)}
            disabled={!rows.length}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-left text-xs">
          <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              {[
                "#",
                "Business name",
                "Google review URL",
                "Rating",
                "Reviews",
                "Risk level",
                "Reason / evidence",
                "Status",
                "Last scanned",
                "Action",
              ].map((heading) => (
                <th key={heading} className="px-3 py-3 font-semibold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((scan, index) => {
              const riskLevel = scan.status === "complete" ? scanRisk(scan) : null;
              const riskLabel =
                riskLevel === "high"
                  ? "High risk"
                  : riskLevel === "medium"
                    ? "Medium risk"
                    : riskLevel === "normal"
                      ? "Low risk"
                      : riskLevel === "requires_review"
                        ? "Needs review"
                        : "—";
              const riskClass =
                riskLevel === "high"
                  ? "text-risk-high"
                  : riskLevel === "medium"
                    ? "text-risk-medium"
                    : riskLevel === "normal"
                      ? "text-risk-normal"
                      : "text-muted-foreground";
              const flagged = scan.high_count + scan.medium_count;
              return (
                <tr key={scan.id} className="border-t align-top hover:bg-muted/30">
                  <td className="px-3 py-3 text-muted-foreground">{first + index}</td>
                  <td className="max-w-40 px-3 py-3 font-medium">
                    <span className="block truncate" title={scan.business_name ?? undefined}>
                      {scan.business_name ?? "Unresolved business"}
                    </span>
                    {scan.address && (
                      <span
                        className="mt-1 block truncate text-[10px] text-muted-foreground"
                        title={scan.address}
                      >
                        {scan.address}
                      </span>
                    )}
                  </td>
                  <td className="max-w-48 px-3 py-3">
                    <a
                      className="block truncate text-brand hover:underline"
                      href={scan.source_url}
                      target="_blank"
                      rel="noreferrer"
                      title={scan.source_url}
                    >
                      {scan.source_url}
                    </a>
                  </td>
                  <td className="px-3 py-3 font-mono">
                    {scan.rating == null ? "—" : Number(scan.rating).toFixed(1)}
                  </td>
                  <td className="px-3 py-3 font-mono">{scan.reviews_retrieved}</td>
                  <td className={`whitespace-nowrap px-3 py-3 font-medium ${riskClass}`}>
                    {riskLabel}
                  </td>
                  <td className="max-w-40 px-3 py-3 text-muted-foreground">
                    {scan.status !== "complete"
                      ? (scan.error ?? "Analysis not complete")
                      : flagged
                        ? `${flagged} review(s) flagged by analysis`
                        : `${scan.normal_count} low risk · ${scan.requires_review_count} need review`}
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill status={scan.status} error={scan.error} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                    {new Date(scan.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-3">
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/reports/$id" params={{ id: scan.id }}>
                        View <ExternalLink className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                  No scans match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
        <span>
          Showing {first} to {last} of {rows.length} results
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2">
            Rows
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number]);
                setPage(1);
              }}
              className="h-8 rounded border bg-background px-2"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            per page
          </label>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </Button>
          <span aria-live="polite">
            {currentPage} / {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= pages}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </Button>
        </div>
      </footer>
    </section>
  );
}
