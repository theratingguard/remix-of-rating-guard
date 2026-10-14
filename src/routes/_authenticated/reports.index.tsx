import { ActionCenter, QualityCenter } from "@/components/ops-panels";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { scansQuery, reportNumber, riskyCount } from "@/lib/data";
import { PageHeader, EmptyState } from "@/components/app-shell";
import { DevTag } from "@/components/review-ui";
import { Button } from "@/components/ui/button";
import { BatchInsightsPanel } from "@/components/batch-insights";
import { RestrictedReportSummary } from "@/components/restricted-report-summary";
import { reportAccessQuery } from "@/lib/report-access";
import { groupReports, compactDate } from "@/lib/operations-ui";
import { ReportListActions } from "@/components/report-list-actions";

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
  if (access.data && access.data !== "super_admin") return <RestrictedReportSummary />;
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
            <div className="space-y-3 text-sm [&_button]:text-sm [&_a]:text-sm">
              {groupReports(reports).map((group) => (
                <details key={group.id} className="surface p-4" open={group.scans.length === 1}>
                  <summary className="cursor-pointer p-4 font-semibold">
                    {group.name} ({group.scans.length} scans)
                  </summary>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left">
                        <tr>
                          {[
                            "Report ID",
                            "Flagged Reviews",
                            "Rating",
                            "Created",
                            "Status",
                            "Actions",
                          ].map((label) => (
                            <th key={label} className="p-4 font-medium">
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {group.scans.map((scan) => (
                          <tr key={scan.id} className="border-t hover:bg-muted/50">
                            <td className="p-4 font-mono">
                              {reportNumber(scan, scan.reports)}
                              {scan.is_seed && <DevTag />}
                            </td>
                            <td className="p-4 font-mono text-lg">{riskyCount(scan)}</td>
                            <td className="p-4">{scan.rating ?? "—"}</td>
                            <td className="whitespace-nowrap p-4">
                              {compactDate(scan.reports?.created_at ?? scan.created_at)}
                            </td>
                            <td className="p-4 font-semibold text-risk-normal">
                              {scan.is_seed ? "Development" : (scan.reports?.status ?? "ready")}
                            </td>
                            <td className="p-4">
                              <Button size="sm" variant="ghost" asChild>
                                <Link to="/reports/$id" params={{ id: scan.id }}>
                                  <Eye /> View
                                </Link>
                              </Button>
                              {!scan.is_seed && <ReportListActions scanId={scan.id} />}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
