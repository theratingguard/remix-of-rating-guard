import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { scansQuery } from "@/lib/data";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { RestrictedReportSummary } from "@/components/restricted-report-summary";
import { reportAccessQuery } from "@/lib/report-access";
import { supabase } from "@/integrations/supabase/client";
import { REVIEW_WORKFLOW_STATUSES, reviewWorkflowMetrics } from "@/lib/review-workflow";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Rating Guard Remix" },
      { name: "description", content: "Review reporting and removal success metrics." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const access = useQuery(reportAccessQuery());
  const scansQueryResult = useQuery(scansQuery());
  const actionsQuery = useQuery({
    queryKey: ["dashboard-review-actions"],
    enabled: access.data === "super_admin",
    queryFn: async () => {
      const [reportedReviews, reports, removed] = await Promise.all([
        supabase
          .from("review_actions")
          .select("id", { count: "exact", head: true })
          .in("status", [...REVIEW_WORKFLOW_STATUSES])
          .throwOnError(),
        supabase
          .from("audit_log")
          .select("id", { count: "exact", head: true })
          .in("action", ["review.report_sent", "review.report_again"])
          .throwOnError(),
        supabase
          .from("review_actions")
          .select("id", { count: "exact", head: true })
          .eq("status", "REMOVED")
          .throwOnError(),
      ]);
      return {
        reportedReviews: reportedReviews.count ?? 0,
        reportEvents: reports.count ?? 0,
        removed: removed.count ?? 0,
      };
    },
  });

  if (access.error)
    return <p role="alert">Could not verify report access: {access.error.message}</p>;
  if (access.isPending) return <p>Verifying report access…</p>;
  if (access.data !== "super_admin") return <RestrictedReportSummary />;
  if (scansQueryResult.error)
    return <p role="alert">Could not load dashboard: {scansQueryResult.error.message}</p>;
  if (actionsQuery.error)
    return <p role="alert">Could not load report totals: {actionsQuery.error.message}</p>;

  const metrics = reviewWorkflowMetrics(
    actionsQuery.data ?? { reportedReviews: 0, reportEvents: 0, removed: 0 },
  );
  const cards = [
    { label: "Total Scans", value: scansQueryResult.data?.length ?? 0 },
    { label: "Total Reports Sent", value: metrics.totalReportsSent },
    { label: "Total Removed", value: metrics.totalRemoved },
    { label: "Overall Success Rate", value: `${metrics.successRate}%` },
  ];

  return (
    <>
      <PageHeader
        title="Superadmin Dashboard"
        subtitle="Track Google review scans, reports, and manually confirmed removals."
        action={
          <Button asChild size="lg" className="min-h-[48px]">
            <Link to="/scan">
              <Plus /> New Scan
            </Link>
          </Button>
        }
      />
      <section
        aria-label="Scan and report metrics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {cards.map((card) => (
          <article key={card.label} className="surface surface-hover min-w-0 p-5">
            <h2 className="text-sm font-medium text-muted-foreground">{card.label}</h2>
            <p className="mt-3 break-words font-mono text-4xl font-semibold tabular">
              {scansQueryResult.isLoading || actionsQuery.isLoading
                ? "—"
                : card.value.toLocaleString()}
            </p>
          </article>
        ))}
      </section>
      <p className="mt-4 text-sm text-muted-foreground">
        Reports and removals are counted from review workflow statuses confirmed by a user. Google
        submissions and removal decisions are not verified automatically.
      </p>
    </>
  );
}
