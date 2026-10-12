import { Activity, AlertTriangle, CheckCircle2, Globe2, ShieldCheck } from "lucide-react";
import type { ScanRow } from "@/lib/data";

export function ScanStatsCards({ scans }: { scans: ScanRow[] }) {
  const completed = scans.filter((scan) => scan.status === "complete");
  const total = (key: "high_count" | "medium_count" | "normal_count") =>
    completed.reduce((sum, scan) => sum + scan[key], 0);
  const cards = [
    {
      label: "URLs submitted",
      value: scans.length,
      note: "One URL per scan",
      Icon: Globe2,
      color: "text-brand",
    },
    {
      label: "Scans completed",
      value: completed.length,
      note: `${scans.filter((scan) => scan.status === "running" || scan.status === "pending").length} active`,
      Icon: CheckCircle2,
      color: "text-risk-normal",
    },
    {
      label: "High-risk reviews",
      value: total("high_count"),
      note: "Across completed scans",
      Icon: AlertTriangle,
      color: "text-risk-high",
    },
    {
      label: "Medium-risk reviews",
      value: total("medium_count"),
      note: "Across completed scans",
      Icon: Activity,
      color: "text-risk-medium",
    },
    {
      label: "Low-risk reviews",
      value: total("normal_count"),
      note: "Across completed scans",
      Icon: ShieldCheck,
      color: "text-risk-normal",
    },
  ];

  return (
    <section
      aria-label="Scan statistics"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-5"
    >
      {cards.map(({ label, value, note, Icon, color }) => (
        <article key={label} className="surface min-w-0 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs text-muted-foreground">{label}</p>
            <Icon className={`h-4 w-4 shrink-0 ${color}`} aria-hidden />
          </div>
          <p className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${color}`}>
            {value.toLocaleString()}
          </p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{note}</p>
        </article>
      ))}
      <p className="col-span-full text-xs text-muted-foreground">
        Risk totals count classifications across completed scan runs; rescanning a business may
        include the same reviews again.
      </p>
    </section>
  );
}
