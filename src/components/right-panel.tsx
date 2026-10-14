import { Link } from "@tanstack/react-router";
import { Download, ExternalLink, FileText, MapPin } from "lucide-react";
import type { ScanRow } from "@/lib/data";
import { scanRisk } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { PrivatePdfButton } from "@/components/private-pdf-button";

const segments = [
  { key: "high_count", label: "High risk", color: "#ef4444" },
  { key: "medium_count", label: "Medium risk", color: "#f59e0b" },
  { key: "normal_count", label: "Low risk", color: "#22c55e" },
  { key: "requires_review_count", label: "Needs review", color: "#94a3b8" },
] as const;

export function RightPanel({
  scans,
  onExportCsv,
  onRiskSelect,
}: {
  scans: ScanRow[];
  onExportCsv: () => void;
  onRiskSelect: (risk: "high" | "medium" | "normal" | "requires_review") => void;
}) {
  const latest = scans[0];
  if (!latest) {
    return (
      <aside className="space-y-4">
        <section className="surface p-5">
          <h2 className="font-semibold">Latest scan report</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            No scan records yet. Run a Google Maps scan to see its summary here.
          </p>
        </section>
      </aside>
    );
  }

  const values = segments.map((segment) => ({
    ...segment,
    value: latest.status === "complete" ? latest[segment.key] : 0,
  }));
  const total = values.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  const gradient = total
    ? `conic-gradient(${values
        .map((item) => {
          const start = offset;
          offset += (item.value / total) * 100;
          return `${item.color} ${start}% ${offset}%`;
        })
        .join(", ")})`
    : "conic-gradient(#94a3b8 0% 100%)";
  const risk = latest.status === "complete" ? scanRisk(latest) : null;
  const riskLabel =
    risk === "high"
      ? "High risk"
      : risk === "medium"
        ? "Medium risk"
        : risk === "normal"
          ? "Low risk"
          : risk === "requires_review"
            ? "Needs review"
            : latest.status;
  const riskClass =
    risk === "high"
      ? "text-risk-high"
      : risk === "medium"
        ? "text-risk-medium"
        : risk === "normal"
          ? "text-risk-normal"
          : "text-muted-foreground";

  return (
    <aside className="space-y-4">
      <section className="surface p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Latest scan report</h2>
          <span
            className={`rounded-full bg-muted px-2 py-1 text-[10px] font-semibold ${riskClass}`}
          >
            {riskLabel}
          </span>
        </div>
        <h3 className="mt-4 text-lg font-semibold">
          {latest.business_name ?? "Google Maps business"}
        </h3>
        {latest.address && (
          <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {latest.address}
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {new Date(latest.created_at).toLocaleString()}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <Metric label="Reviews fetched" value={latest.reviews_retrieved} />
          <Metric label="High risk" value={latest.high_count} />
          <Metric label="Medium risk" value={latest.medium_count} />
          <Metric label="Low risk" value={latest.normal_count} />
          <Metric label="Needs review" value={latest.requires_review_count} />
          <Metric label="Status" value={latest.status} />
        </dl>
        <Button asChild className="mt-4 w-full" variant="outline">
          <Link to="/reports/$id" params={{ id: latest.id }}>
            View full report <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </Link>
        </Button>
      </section>

      <section className="surface p-5">
        <h2 className="font-semibold">Risk distribution</h2>
        <div className="mt-4 flex items-center gap-4">
          <div
            className="grid size-24 shrink-0 place-items-center rounded-full"
            style={{ background: gradient }}
          >
            <div className="grid size-14 place-items-center rounded-full bg-card text-center">
              <span className="font-mono text-sm font-semibold">{total}</span>
              <span className="text-[9px] text-muted-foreground">reviews</span>
            </div>
          </div>
          <ul className="min-w-0 flex-1 space-y-2">
            {values.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="font-mono">
                  {item.value}
                  {total ? ` (${Math.round((item.value / total) * 100)}%)` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {latest.status !== "complete" && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Distribution appears after analysis completes.
          </p>
        )}
      </section>

      <section className="surface p-5">
        <h2 className="font-semibold">Latest scan quick reports</h2>
        <div className="mt-3 space-y-2">
          {values.map((item) => (
            <button
              key={item.key}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
              onClick={() =>
                onRiskSelect(
                  item.key === "high_count"
                    ? "high"
                    : item.key === "medium_count"
                      ? "medium"
                      : item.key === "normal_count"
                        ? "normal"
                        : "requires_review",
                )
              }
            >
              <span>{item.label}</span>
              <span className="font-mono">{item.value}</span>
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          className="mt-3 w-full"
          onClick={onExportCsv}
          disabled={!scans.length}
        >
          <Download className="mr-2 h-4 w-4" /> Export scan CSV
        </Button>
        {latest.status === "complete" && (
          <div className="[&>button]:mt-2 [&>button]:w-full">
            <PrivatePdfButton scanId={latest.id} variant="full">
              <Download className="mr-2 h-4 w-4" /> Preview PDF Report
            </PrivatePdfButton>
          </div>
        )}
      </section>

      <section className="surface p-5">
        <h2 className="font-semibold">Scan details</h2>
        <dl className="mt-3 space-y-2 text-xs">
          <Metric label="Scan ID" value={latest.id.slice(0, 13)} />
          <Metric label="Scan date" value={new Date(latest.created_at).toLocaleDateString()} />
          <Metric label="URLs in history" value={scans.length} />
          <Metric
            label="Completed scans"
            value={scans.filter((scan) => scan.status === "complete").length}
          />
          <Metric
            label="Failed scans"
            value={scans.filter((scan) => scan.status === "failed").length}
          />
          <Metric label="Status" value={latest.status} />
          {latest.started_at && latest.completed_at && (
            <Metric
              label="Duration"
              value={`${Math.max(0, Math.round((Date.parse(latest.completed_at) - Date.parse(latest.started_at)) / 1000))} sec`}
            />
          )}
        </dl>
        {latest.reports?.report_number && (
          <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <FileText className="h-3.5 w-3.5" aria-hidden />
            {latest.reports.report_number}
          </p>
        )}
      </section>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd
        className="max-w-[60%] truncate text-right font-medium tabular-nums"
        title={String(value)}
      >
        {value}
      </dd>
    </div>
  );
}
