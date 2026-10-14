import { savedLegalAnalysis, type LegalReview } from "@/lib/legal-analysis";
import { removalBand, removalSummary } from "@/lib/review-metrics";
import type { Json } from "@/integrations/supabase/types";
export function RemovalBadge({ item }: { item?: LegalReview | undefined }) {
  const band = removalBand(item);
  const colors = {
    high: "bg-red-100 text-red-800",
    medium: "bg-orange-100 text-orange-800",
    low: "bg-yellow-100 text-yellow-800",
    not_estimable: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${colors[band]}`}>
      {band === "high"
        ? "🔴 High"
        : band === "medium"
          ? "🟠 Medium"
          : band === "low"
            ? "🟡 Low"
            : "Not estimable"}{" "}
      ·{" "}
      {item?.violates_policy && item.prediction?.probability !== null && item.prediction
        ? `${item.prediction.probability}% cohort estimate`
        : "Insufficient comparable outcome data"}
    </span>
  );
}
export function RemovalSummary({ metadata, total }: { metadata: Json | undefined; total: number }) {
  const legal = savedLegalAnalysis(metadata);
  const summary = removalSummary(legal?.reviews ?? [], total);
  return (
    <section className="surface my-5 p-5">
      <h2 className="font-bold">Removal Possibility Summary</h2>
      <p className="my-2">
        🔴 High: {summary.high} · 🟠 Medium: {summary.medium} · 🟡 Low: {summary.low} · Not
        estimable: {summary.notEstimable}
      </p>
      <p className="text-xs text-muted-foreground">
        Bands use historical outcome-cohort rates only when at least 30 comparable recorded
        decisions exist: high 70–100, medium 40–69, low 0–39. Otherwise the estimate is not
        estimable. Outcomes are manually recorded and are not independently verified Google
        decisions; this is not an individual guarantee. Genuine negative feedback is not
        automatically removable.
      </p>
    </section>
  );
}
