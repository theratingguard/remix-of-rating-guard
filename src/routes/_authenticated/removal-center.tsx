import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Globe2 } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { reportAccessQuery } from "@/components/restricted-report-summary";
import { getRegionalRemovalSummary } from "@/lib/regional-center.functions";
import { REGION_OPTIONS, type Region } from "@/lib/regional-routing";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/removal-center")({
  head: () => ({
    meta: [
      { title: "Regional Removal Center — Rating Guard" },
      { name: "description", content: "Regional policy routing and verified submission outcomes." },
    ],
  }),
  component: RemovalCenterPage,
});

const labels = new Map<Region, string>(REGION_OPTIONS.map(({ value, label }) => [value, label]));

function RemovalCenterPage() {
  const access = useQuery(reportAccessQuery());
  const loadSummary = useServerFn(getRegionalRemovalSummary);
  const summary = useQuery({
    queryKey: ["regional-removal-summary"],
    queryFn: () => loadSummary(),
    enabled: access.data === "super_admin",
    retry: false,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Regional Removal Center"
        subtitle="Business-location routing and outcomes recorded by your team."
      />
      {access.isPending && <p role="status">Checking access…</p>}
      {access.data && access.data !== "super_admin" && (
        <section className="surface flex items-start gap-3 p-5" role="alert">
          <AlertTriangle className="mt-0.5 size-5 text-risk-medium" aria-hidden />
          <p>This center is restricted to Super Admin accounts.</p>
        </section>
      )}
      {access.data === "super_admin" && summary.isPending && (
        <p role="status">Loading recorded regional outcomes…</p>
      )}
      {summary.error && (
        <section className="surface space-y-3 p-5" role="alert">
          <p>Regional data could not be loaded: {summary.error.message}</p>
          <Button variant="outline" onClick={() => void summary.refetch()}>
            Retry
          </Button>
        </section>
      )}
      {summary.data && (
        <>
          <section className="surface space-y-3 p-5">
            <div className="flex items-center gap-2 font-semibold">
              <Globe2 className="size-5" aria-hidden />
              Outcome data
            </div>
            <p className="text-sm text-muted-foreground">{summary.data.note}</p>
            <p className="text-sm text-muted-foreground">
              Routing currently uses one shared BullMQ legal queue and jurisdiction strategy
              selection. This does not create independent country processes or automatically
              ascertain Google&apos;s decision.
            </p>
          </section>

          <section className="surface overflow-x-auto p-5">
            <h2 className="mb-4 font-semibold">Recorded outcomes by business region</h2>
            {summary.data.regions.length ? (
              <table className="w-full min-w-[740px] text-left text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-3 py-2">Region</th>
                    <th className="px-3 py-2">Scans</th>
                    <th className="px-3 py-2">Submissions</th>
                    <th className="px-3 py-2">Pending</th>
                    <th className="px-3 py-2">Approved</th>
                    <th className="px-3 py-2">Rejected</th>
                    <th className="px-3 py-2">Resolved success</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.data.regions.map((item) => (
                    <tr key={item.region} className="border-b last:border-0">
                      <th scope="row" className="px-3 py-3 font-medium">
                        {labels.get(item.region) ?? item.jurisdiction}
                      </th>
                      <td className="px-3 py-3">{item.scans}</td>
                      <td className="px-3 py-3">{item.submissions}</td>
                      <td className="px-3 py-3">{item.pending}</td>
                      <td className="px-3 py-3">{item.approved}</td>
                      <td className="px-3 py-3">{item.rejected}</td>
                      <td className="px-3 py-3">
                        {item.success_rate === null
                          ? "No resolved outcomes"
                          : `${item.success_rate}% (${item.approved}/${item.resolved})`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">
                No live scans or recorded regional submissions are available yet.
              </p>
            )}
          </section>

          <section className="surface p-5">
            <h2 className="mb-4 font-semibold">Jurisdiction strategy registry</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {summary.data.strategies.map((strategy) => (
                <article key={strategy.region} className="rounded-lg border p-4">
                  <h3 className="font-medium">
                    {labels.get(strategy.region) ?? strategy.jurisdiction}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {strategy.worker} · {strategy.removalMethod}
                  </p>
                  <a
                    className="mt-2 inline-block text-sm underline underline-offset-4"
                    href={strategy.policyUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google review policies
                  </a>
                  <p className="mt-2 text-xs text-muted-foreground">{strategy.legalGuidance}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
