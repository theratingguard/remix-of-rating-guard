import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getSmartAlerts,
  compareCompetitors,
  sendWeeklyInsights,
} from "@/lib/smart-alerts.functions";
import { Button } from "./ui/button";
export function SmartAlerts() {
  const load = useServerFn(getSmartAlerts),
    compare = useServerFn(compareCompetitors),
    email = useServerFn(sendWeeklyInsights);
  const [ownId, setOwn] = useState(""),
    [competitorId, setCompetitor] = useState(""),
    [busy, setBusy] = useState(false);
  const [comparison, setComparison] = useState<Awaited<
    ReturnType<typeof compareCompetitors>
  > | null>(null);
  const query = useQuery({
    queryKey: ["smart-alerts"],
    queryFn: () => load(),
    refetchInterval: 60000,
  });
  if (query.error) return <p role="alert">Smart Alerts unavailable: {query.error.message}</p>;
  if (!query.data) return <p>Loading Smart Alerts...</p>;
  const data = query.data;
  return (
    <section className="surface my-6 p-5">
      <h2 className="text-lg font-bold">Smart Alerts &amp; Insights</h2>
      <p className="text-xs">
        Since {new Date(data.since).toLocaleString()}: latest fetched sample per business scanned in
        the last 7 days, not all reviews published in that period. {data.sampleSize} fetched /{" "}
        {data.flagged} flagged concerns. Refresh every minute.
      </p>
      <h3 className="mt-3 font-semibold">Trending policy concerns</h3>
      {data.trends.length ? (
        <ul>
          {data.trends.map((row) => (
            <li key={row.policy}>
              {row.policy}: {row.count}/{data.flagged} flagged reviews ({row.percent}%).
            </li>
          ))}
        </ul>
      ) : (
        <p>No flagged concerns in this fetched sample.</p>
      )}
      {data.businessTrends.map((row) => (
        <p key={`${row.type}:${row.policy}`}>
          {row.type}: {row.policy} in {row.count}/{row.total} fetched flagged concerns (
          {row.percent}%). Observational sample, not a prediction for every business.
        </p>
      ))}
      <h3 className="mt-3 font-semibold">Observed patterns</h3>
      <p>
        Published today (UTC) in fetched samples: {data.today.sampleSize} reviews,{" "}
        {data.today.flagged} flagged. This is not proof of a review burst.
      </p>
      {data.patterns.map((pattern) => (
        <p key={pattern}>{pattern}</p>
      ))}
      <p className="text-xs">
        Reviewer-wide activity and affiliation unavailable; no claim that a reviewer rated 20
        businesses. Business-type trends require at least 5 fetched flagged reviews with a recorded
        business type.
      </p>
      <h3 className="mt-3 font-semibold">Competitor comparison (you select the relationship)</h3>
      <div className="my-2 flex flex-wrap gap-2">
        <select
          aria-label="Your scanned business"
          value={ownId}
          onChange={(event) => {
            setOwn(event.target.value);
            setComparison(null);
          }}
          className="rounded border bg-background p-2"
        >
          <option value="">Your business</option>
          {data.businesses.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Scanned competitor"
          value={competitorId}
          onChange={(event) => {
            setCompetitor(event.target.value);
            setComparison(null);
          }}
          className="rounded border bg-background p-2"
        >
          <option value="">Competitor</option>
          {data.businesses.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <Button
          disabled={busy || !ownId || !competitorId || ownId === competitorId}
          onClick={async () => {
            setBusy(true);
            try {
              setComparison(await compare({ data: { ownId, competitorId } }));
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Comparison failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Compare
        </Button>
      </div>
      {comparison && (
        <p>
          {comparison.own.name}: {comparison.own.total_reviews ?? "unknown"} reviews /{" "}
          {comparison.own.rating ?? "unknown"} stars. {comparison.competitor.name}:{" "}
          {comparison.competitor.total_reviews ?? "unknown"} reviews /{" "}
          {comparison.competitor.rating ?? "unknown"} stars.{" "}
          {comparison.shortfall === null
            ? "No measured review-count shortfall."
            : `${comparison.shortfall}% fewer reviews than selected competitor.`}{" "}
          Counts are last scanned snapshots, not live competitor monitoring.
        </p>
      )}
      <h3 className="mt-3 font-semibold">Weekly report</h3>
      <p>
        {data.flagged} fetched concerns flagged; decisions recorded this week:{" "}
        {data.weekly.approvedThisWeek} approved / {data.weekly.rejectedThisWeek} rejected. Requests
        submitted this week: {data.weekly.pending} currently pending. Decisions are
        representative-entered, not automatically checked.
      </p>
      <Button
        disabled={busy || !data.emailAvailable}
        onClick={async () => {
          setBusy(true);
          try {
            await email();
            toast.success("SMTP accepted weekly insights for Super Admin; delivery not confirmed.");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Weekly email failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Email Weekly Report to Super Admin
      </Button>
      {!data.emailAvailable && (
        <p className="text-xs">
          Email unavailable until SMTP is configured and Email Share enabled. No automatic weekly
          scheduling claimed.
        </p>
      )}
    </section>
  );
}
