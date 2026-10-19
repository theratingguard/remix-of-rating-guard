import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clientReportsQuery } from "@/lib/client-portal";

export const Route = createFileRoute("/_authenticated/client/reports")({
  component: ClientReportsPage,
});

function ClientReportsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const reports = useQuery(clientReportsQuery(page, search));
  const visibleReports = reports.data?.reports ?? [];
  const totalReports = reports.data?.total ?? 0;

  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-primary">Your documents</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Reports</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Review report drafts, decision status, and saved assessment PDFs.
          </p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setPage(0);
              setSearch(event.target.value);
            }}
            placeholder="Search business or report"
            aria-label="Search reports by business name"
            className="pl-9"
          />
        </div>
      </div>

      <Card className="overflow-hidden hover:translate-y-0">
        {reports.isPending ? (
          <div className="space-y-3 p-5" aria-label="Loading reports">
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-12 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : reports.error ? (
          <div role="alert" className="p-6 text-sm text-destructive">
            Reports could not be loaded. Please refresh and try again.
          </div>
        ) : visibleReports.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <FileText className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">{search ? "No matching reports" : "No reports yet"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search ? "Try another business name." : "Reports appear here after your first scan."}
            </p>
            {!search && (
              <Button asChild variant="outline" className="mt-4">
                <Link to="/client/scan">Start a scan</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium sm:px-6">Business</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Document</th>
                </tr>
              </thead>
              <tbody>
                {visibleReports.map((report) => (
                  <tr key={report.id} className="border-t">
                    <td className="px-5 py-4 sm:px-6">
                      <p className="font-medium">{report.businessName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{report.reportNumber}</p>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          report.status === "Removed"
                            ? "bg-emerald-100 text-emerald-800"
                            : report.status === "Rejected"
                              ? "bg-red-100 text-red-800"
                              : report.status === "Pending"
                                ? "bg-amber-100 text-amber-900"
                                : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {report.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {report.pdfUrl ? (
                        <Button asChild variant="outline" size="sm">
                          <a href={report.pdfUrl} target="_blank" rel="noreferrer">
                            <Download className="mr-2 size-4" />
                            Download PDF
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">PDF not available</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!reports.isPending && !reports.error && totalReports > 50 && (
          <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {page * 50 + 1}–{Math.min((page + 1) * 50, totalReports)} of{" "}
              {totalReports.toLocaleString()} reports
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={(page + 1) * 50 >= totalReports}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
