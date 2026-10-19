import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  FileCheck2,
  MessageSquareWarning,
  ScanLine,
  ShieldCheck,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { clientDashboardQuery } from "@/lib/client-portal";

export const Route = createFileRoute("/_authenticated/client/dashboard")({
  component: ClientDashboardPage,
});

const statCards = [
  { key: "totalReviewsScanned", title: "Reviews scanned", Icon: ScanLine },
  { key: "badReviewsDetected", title: "1–2 star reviews", Icon: MessageSquareWarning },
  { key: "reportsSubmitted", title: "Reports submitted", Icon: FileCheck2 },
  { key: "successfulRemovals", title: "Successful removals", Icon: ShieldCheck },
] as const;

function ClientDashboardPage() {
  const dashboard = useQuery(clientDashboardQuery());

  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-primary">Your overview</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Track review scans, prepared reports, and confirmed outcomes.
          </p>
        </div>
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link to="/client/scan">
            <Star className="mr-2 size-4" />
            New scan
          </Link>
        </Button>
      </div>

      {dashboard.error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          Dashboard data could not be loaded. Please refresh the page.
        </p>
      )}

      <section aria-label="Review statistics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ key, title, Icon }) => (
          <Card key={key} className="hover:translate-y-0">
            <CardContent className="flex items-center gap-4 p-5">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{title}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {dashboard.isPending ? "—" : (dashboard.data?.[key] ?? 0).toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="hover:translate-y-0">
        <div className="flex items-center justify-between gap-4 border-b px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-semibold">Recent activity</h2>
            <p className="mt-1 text-sm text-muted-foreground">Your latest business review scans</p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/client/reports">
              Reports <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
        {dashboard.isPending ? (
          <div className="space-y-3 p-5" aria-label="Loading activity">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-11 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : dashboard.data?.recentActivity.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b">
                  <th className="px-5 py-3 font-medium sm:px-6">Date</th>
                  <th className="px-5 py-3 font-medium">Business</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.data.recentActivity.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-5 py-4 text-muted-foreground sm:px-6">
                      {new Date(row.createdAt).toLocaleDateString()}
                    </td>
                    <td className="max-w-64 truncate px-5 py-4 font-medium">
                      {row.businessName ?? "Business"}
                    </td>
                    <td className="px-5 py-4">{row.action}</td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <ScanLine className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">No scans yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Start with a Google Maps business or review link.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/client/scan">Start your first scan</Link>
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
