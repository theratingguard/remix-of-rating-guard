import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import type { DashboardScanRow } from "@/lib/data";
import { scanRisk } from "@/lib/data";
import { countryCodeFromAddress } from "@/lib/regional-routing";
import { ScansCsvExportButton } from "@/components/scans-csv-export-button";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/app-shell";

type RiskFilter = "all" | "high" | "medium" | "normal" | "requires_review";
type DateFilter = "all" | "today" | "week" | "month" | "custom";
const PAGE_SIZES = [10, 25, 50] as const;

function localDateKey(date: Date) {
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function countryCode(scan: DashboardScanRow) {
  if (scan.region === "IN" || scan.region === "US") return scan.region;
  if (scan.region === "UK") return "GB";
  return countryCodeFromAddress(scan.address);
}

function countryLabel(code: string | null) {
  if (code === "IN") return "India";
  if (code === "PK") return "Pakistan";
  if (code === "US") return "USA";
  if (code === "GB") return "UK";
  return code ?? "Unknown";
}

export function ScannedUrlsTable({
  scans,
  search,
  location,
  risk,
  onRiskFilterChange,
  onRefresh,
  isRefreshing,
}: {
  scans: DashboardScanRow[];
  search: string;
  location: string;
  risk: RiskFilter;
  onRiskFilterChange: (risk: RiskFilter) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const [status, setStatus] = useState("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [businessSearch, setBusinessSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [
    search,
    location,
    risk,
    status,
    dateFilter,
    customStart,
    customEnd,
    countryFilter,
    ratingFilter,
    businessSearch,
    sortOrder,
  ]);
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const nameQuery = businessSearch.trim().toLowerCase();
    const today = new Date();
    let startDate = "";
    let endDate = "";
    if (dateFilter === "today") {
      startDate = localDateKey(today);
      endDate = startDate;
    } else if (dateFilter === "week") {
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      startDate = localDateKey(monday);
      endDate = localDateKey(today);
    } else if (dateFilter === "month") {
      startDate = localDateKey(new Date(today.getFullYear(), today.getMonth(), 1));
      endDate = localDateKey(today);
    } else if (dateFilter === "custom") {
      startDate = customStart;
      endDate = customEnd;
    }
    const filtered = scans.filter((scan) => {
      const name = (scan.business_name ?? "").toLowerCase();
      if (nameQuery && !name.includes(nameQuery)) return false;
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
      if (countryFilter !== "all" && countryCode(scan) !== countryFilter) return false;
      if (ratingFilter !== "all" && Math.round(Number(scan.rating)) !== Number(ratingFilter))
        return false;
      if (dateFilter !== "all") {
        const scanDate = localDateKey(new Date(scan.created_at));
        if (!scanDate || (startDate && scanDate < startDate) || (endDate && scanDate > endDate))
          return false;
      }
      return true;
    });
    return filtered.sort((left, right) => {
      const nameCompare = (left.business_name ?? "").localeCompare(
        right.business_name ?? "",
        undefined,
        {
          sensitivity: "base",
        },
      );
      return sortOrder === "asc" ? nameCompare : -nameCompare;
    });
  }, [
    scans,
    search,
    businessSearch,
    location,
    status,
    risk,
    dateFilter,
    customStart,
    customEnd,
    countryFilter,
    ratingFilter,
    sortOrder,
  ]);
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
          <label>
            <span className="sr-only">Filter by status</span>
            <select
              aria-label="All statuses"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
              }}
              className="h-8 rounded-lg border bg-background px-3 text-xs"
            >
              <option value="all">All statuses</option>
              <option value="complete">Complete</option>
              <option value="running">Running</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <ScansCsvExportButton scans={rows} label="Save CSV to VPS" />
        </div>
      </div>
      <div className="grid gap-2 border-b p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <label className="relative">
          <span className="sr-only">Search business name</span>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            aria-label="Search business name"
            value={businessSearch}
            onChange={(event) => setBusinessSearch(event.target.value)}
            placeholder="Search business"
            className="h-8 w-full rounded-lg border bg-background pl-8 pr-2 text-xs"
          />
        </label>
        <label>
          <span className="sr-only">Filter by scan date</span>
          <select
            aria-label="Filter by date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value as DateFilter)}
            className="h-8 w-full rounded-lg border bg-background px-2 text-xs"
          >
            <option value="all">Any date</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="custom">Custom dates</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by country</span>
          <select
            aria-label="Filter by country"
            value={countryFilter}
            onChange={(event) => setCountryFilter(event.target.value)}
            className="h-8 w-full rounded-lg border bg-background px-2 text-xs"
          >
            <option value="all">All countries</option>
            <option value="IN">India</option>
            <option value="PK">Pakistan</option>
            <option value="US">USA</option>
            <option value="GB">UK</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by business rating</span>
          <select
            aria-label="Filter by rating"
            value={ratingFilter}
            onChange={(event) => setRatingFilter(event.target.value)}
            className="h-8 w-full rounded-lg border bg-background px-2 text-xs"
          >
            <option value="all">All ratings</option>
            {[5, 4, 3, 2, 1].map((stars) => (
              <option key={stars} value={stars}>
                {stars}★
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by risk level</span>
          <select
            aria-label="All risk levels"
            value={risk === "requires_review" ? "low" : risk}
            onChange={(event) =>
              updateRisk(event.target.value === "low" ? "requires_review" : event.target.value)
            }
            className="h-8 w-full rounded-lg border bg-background px-2 text-xs"
          >
            <option value="all">All risks</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low (needs review)</option>
            <option value="normal">Normal</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Sort businesses alphabetically</span>
          <select
            aria-label="Sort businesses"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as "asc" | "desc")}
            className="h-8 w-full rounded-lg border bg-background px-2 text-xs"
          >
            <option value="asc">Sort A-Z</option>
            <option value="desc">Sort Z-A</option>
          </select>
        </label>
        {dateFilter === "custom" && (
          <div className="grid grid-cols-2 gap-2 sm:col-span-2 xl:col-span-3">
            <label>
              <span className="sr-only">Start date</span>
              <input
                aria-label="Start date"
                type="date"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
                className="h-8 w-full rounded-lg border bg-background px-2 text-xs"
              />
            </label>
            <label>
              <span className="sr-only">End date</span>
              <input
                aria-label="End date"
                type="date"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
                className="h-8 w-full rounded-lg border bg-background px-2 text-xs"
              />
            </label>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-left text-xs">
          <thead className="bg-muted/50 text-[13px] font-bold tracking-wide text-muted-foreground">
            <tr>
              {[
                "#",
                "Business name",
                "Country",
                "Google review URL",
                "Rating",
                "Reviews",
                "Risk level",
                "Reason / evidence",
                "Status",
                "Last scanned",
                "Action",
              ].map((heading) => (
                <th key={heading} className="px-2 py-2 font-bold">
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
                <tr key={scan.id} className="h-10 border-t align-middle hover:bg-muted/30">
                  <td className="px-2 py-2 text-muted-foreground">{first + index}</td>
                  <td className="max-w-40 px-2 py-2 font-medium">
                    <span className="block truncate" title={scan.business_name ?? undefined}>
                      {scan.business_name ?? "Unresolved business"}
                    </span>
                    {scan.address && (
                      <span
                        className="block truncate text-[12px] text-muted-foreground"
                        title={scan.address}
                      >
                        {scan.address}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2">{countryLabel(countryCode(scan))}</td>
                  <td className="max-w-48 px-2 py-2">
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
                  <td className="px-2 py-2 font-mono">
                    {scan.rating == null ? "—" : Number(scan.rating).toFixed(1)}
                  </td>
                  <td className="px-2 py-2 font-mono">{scan.reviews_retrieved}</td>
                  <td className={`whitespace-nowrap px-2 py-2 font-medium ${riskClass}`}>
                    {riskLabel}
                  </td>
                  <td className="max-w-40 px-2 py-2 text-muted-foreground">
                    {scan.status !== "complete"
                      ? (scan.error ?? "Analysis not complete")
                      : flagged
                        ? `${flagged} review(s) flagged by analysis`
                        : `${scan.normal_count} low risk · ${scan.requires_review_count} need review`}
                  </td>
                  <td className="px-2 py-2">
                    <StatusPill status={scan.status} error={scan.error} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                    {new Date(scan.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-2 py-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                      <Link to="/reports/$id" params={{ id: scan.id }}>
                        View <ExternalLink className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-muted-foreground">
                  No scans match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2 text-xs text-muted-foreground">
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
