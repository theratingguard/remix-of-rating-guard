import { savedLegalAnalysis, type LegalReview } from "@/lib/legal-analysis";
import { removalBand, removalSummary } from "@/lib/review-metrics";
import type { Json } from "@/integrations/supabase/types";
export function RemovalBadge({ item }: { item?: LegalReview | undefined }) {
  const band = removalBand(item);
  const colors = {
    high: "bg-red-100 text-red-800",
    medium: "bg-orange-100 text-orange-800",
    low: "bg-yellow-100 text-yellow-800",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${colors[band]}`}>
      {band === "high" ? "🔴 High" : band === "medium" ? "🟠 Medium" : "🟡 Low"} ·{" "}
      {item?.violates_policy
        ? `${item.removal_likelihood}% advisory score`
        : "Insufficient evidence / not estimable"}
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
        🔴 High: {summary.high} · 🟠 Medium: {summary.medium} · 🟡 Low: {summary.low}
      </p>
      <p className="text-xs text-muted-foreground">
        Color bands reflect uncalibrated AI scores, not verified removal chances: high 70–100,
        medium 40–69, low 0–39. Unsupported or unassessed reviews are low/not estimable. Genuine
        negative feedback is not automatically removable.
      </p>
    </section>
  );
}
