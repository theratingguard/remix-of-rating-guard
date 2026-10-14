import { Activity, AlertTriangle, CheckCircle2, Clock3, XCircle } from "lucide-react";
import type { DashboardScanRow } from "@/lib/data";

export function ScanProgress({ scans }: { scans: DashboardScanRow[] }) {
  const complete = scans.filter((scan) => scan.status === "complete").length;
  const active = scans.filter((scan) => scan.status === "running" || scan.status === "pending");
  const failed = scans.filter((scan) => scan.status === "failed").length;
  const percentage = scans.length ? Math.round((complete / scans.length) * 100) : 0;
  const finished = scans.filter((scan) => scan.status === "complete");
  const totals = {
    high: finished.reduce((sum, scan) => sum + scan.high_count, 0),
    medium: finished.reduce((sum, scan) => sum + scan.medium_count, 0),
    low: finished.reduce((sum, scan) => sum + scan.normal_count, 0),
  };

  return (
    <section className="surface p-5" aria-label="Scan progress">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-brand" aria-hidden />
          <h2 className="font-semibold">
            {active.length ? "Scanning in progress" : "Scan activity"}
          </h2>
          {active.length > 0 && (
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
              {active.length} active
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {complete} of {scans.length} scan URLs completed · {percentage}%
        </p>
      </div>
      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Completed scan records"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
      >
        <div
          className="h-full rounded-full bg-risk-normal transition-[width]"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-risk-normal" aria-hidden />
          {complete} successful
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5 text-brand" aria-hidden />
          {active.length} processing
        </span>
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-risk-high" aria-hidden />
          {totals.high} high risk
        </span>
        <span>{totals.medium} medium risk</span>
        <span>{totals.low} low risk</span>
        <span className="inline-flex items-center gap-1.5">
          <XCircle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          {failed} failed
        </span>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Progress reflects scan records currently in history. The worker does not expose a reliable
        per-scan percentage or time estimate.
      </p>
    </section>
  );
}
