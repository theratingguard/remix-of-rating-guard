import { ActionCenter, QualityCenter } from "@/components/ops-panels";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye } from "lucide-react";
import { scansQuery, fmtDate, reportNumber, riskyCount } from "@/lib/data";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { DevTag } from "@/components/review-ui";
import { Button } from "@/components/ui/button";
import { BatchInsightsPanel } from "@/components/batch-insights";
import { reportAccessQuery, RestrictedReportSummary } from "@/components/restricted-report-summary";

export const Route = createFileRoute("/_authenticated/reports/")({
  head: () => ({
    meta: [
      { title: "Reports — Rating Guard Remix" },
      { name: "description", content: "Google review risk evidence reports." },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const access = useQuery(reportAccessQuery());
  const { data: scans = [], isLoading, error } = useQuery(scansQuery());
  const reports = scans.filter((s) => s.status === "complete" && s.reports);
  if (access.error)
    return <p role="alert">Could not verify report access: {access.error.message}</p>;
  if (access.data === "franchise" || access.data === "reseller") return <RestrictedReportSummary />;
  if (access.isPending) return <p>Verifying report access…</p>;
  if (error) return <p role="alert">Could not load reports: {error.message}</p>;
  return (
    <>
      <PageHeader title="Reports" subtitle="Evidence reports generated from completed scans." />
      <Tabs defaultValue="reports">
        <TabsList className="mb-4">
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="actions">Action Center</TabsTrigger>
          <TabsTrigger value="quality">Quality Center</TabsTrigger>
        </TabsList>
        <TabsContent value="actions">
          <ActionCenter />
        </TabsContent>
        <TabsContent value="quality">
          <QualityCenter />
        </TabsContent>
        <TabsContent value="reports">
          <BatchInsightsPanel />
          {!isLoading && reports.length === 0 ? (
            <EmptyState title="No reports generated." />
          ) : (
            <div className="surface overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    {[
                      "Report ID",
                      "Business",
                      "Risky Reviews",
                      "Rating",
                      "Created",
                      "Status",
                      "Actions",
                    ].map((h) => (
                      <th key={h} className="px-5 py-3 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reports.map((s) => (
                    <tr key={s.id} className="border-t hover:bg-muted/50">
                      <td className="px-5 py-3 font-mono text-xs">{reportNumber(s, s.reports)}</td>
                      <td className="px-5 py-3 font-medium">
                        {s.business_name}
                        {s.is_seed && <DevTag />}
                      </td>
                      <td className="px-5 py-3 font-mono">{riskyCount(s)}</td>
                      <td className="px-5 py-3 font-mono">
                        {s.rating != null ? Number(s.rating).toFixed(1) : "—"}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {fmtDate(s.reports?.created_at ?? s.created_at)}
                      </td>
                      <td className="px-5 py-3 text-xs font-semibold capitalize">
                        {s.is_seed ? (
                          <span className="text-risk-medium">Development</span>
                        ) : (
                          <span className="text-risk-normal">{s.reports?.status ?? "ready"}</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" asChild>
                            <Link to="/reports/$id" params={{ id: s.id }}>
                              <Eye /> View
                            </Link>
                          </Button>
                          <Button size="sm" variant="ghost" asChild>
                            <Link to="/reports/$id" params={{ id: s.id }} search={{ print: true }}>
                              <Download /> Download
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
