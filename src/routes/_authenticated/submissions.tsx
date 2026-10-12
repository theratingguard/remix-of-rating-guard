import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { RemovalAnalytics } from "@/components/removal-workflow";
import { reportAccessQuery, RestrictedReportSummary } from "@/components/restricted-report-summary";
import { outcomeSummary } from "@/lib/removal-workflow";
import { pageSlice, compactDate } from "@/lib/operations-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getExtensionReport } from "@/lib/extension.functions";
import { toast } from "sonner";
import { isGoogleMapsUrl } from "@/lib/google-url";

export const Route = createFileRoute("/_authenticated/submissions")({
  head: () => ({ meta: [{ title: "Submissions — Rating Guard Remix" }] }),
  component: SubmissionsPage,
});

async function loadSubmissions() {
  const outcomes = [];
  for (let offset = 0; ; offset += 500) {
    const result = await supabase
      .from("removal_outcomes")
      .select("*")
      .order("id")
      .range(offset, offset + 499)
      .throwOnError();
    outcomes.push(...result.data);
    if (result.data.length < 500) break;
    if (offset >= 49500)
      throw new Error(
        "Submission analytics exceed 50,000 records; no truncated success rate shown.",
      );
  }
  const [notices] = await Promise.all([
    supabase
      .from("submission_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
      .throwOnError(),
  ]);
  const scans = [];
  const reviews = [];
  for (let offset = 0; offset < outcomes.length; offset += 500) {
    const batch = outcomes.slice(offset, offset + 500);
    const [scanRows, reviewRows] = await Promise.all([
      supabase
        .from("scans")
        .select("id,business_name")
        .in("id", [...new Set(batch.map((row) => row.scan_id))])
        .throwOnError(),
      supabase
        .from("reviews")
        .select("id,text,review_uri")
        .in(
          "id",
          batch.map((row) => row.review_id),
        )
        .throwOnError(),
    ]);
    scans.push(...scanRows.data);
    reviews.push(...reviewRows.data);
  }
  return {
    outcomes: outcomes.sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)),
    scans,
    reviews,
    notices: notices.data,
  };
}
function SubmissionsPage() {
  const access = useQuery(reportAccessQuery());
  const query = useQuery({
    queryKey: ["submissions"],
    queryFn: loadSubmissions,
    enabled: access.data === "super_admin",
    refetchInterval: 30000,
  });
  const [page, setPage] = useState(1);
  const [scanId, setScanId] = useState("");
  const [extensionStatus, setExtensionStatus] = useState("");
  const [checking, setChecking] = useState(false);
  if (access.error) return <p role="alert">{access.error.message}</p>;
  if (access.data && access.data !== "super_admin") return <RestrictedReportSummary />;
  if (query.error) return <p role="alert">Submission refresh failed: {query.error.message}</p>;
  if (!query.data) return <p>Loading submissions...</p>;
  const data = query.data;
  const summary = outcomeSummary(data.outcomes);
  const paging = pageSlice(data.outcomes, page);
  return (
    <>
      <PageHeader
        title="Submissions"
        subtitle="Actual representative-recorded submissions and decisions. Not automatically submitted or verified by Google."
      />
      <section className="surface mb-4 space-y-3 p-6 text-sm">
        <h2 className="font-semibold">Chrome extension report readiness</h2>
        <p>
          Verify a scan ID before loading it in the extension. Only supported drafts with exact
          source evidence and Google review URLs are eligible. This does not submit anything.
        </p>
        <Input
          aria-label="Scan ID for extension"
          value={scanId}
          onChange={(event) => setScanId(event.target.value)}
          placeholder="Scan UUID from your report URL"
        />
        <Button
          disabled={checking || !scanId.trim()}
          onClick={async () => {
            setChecking(true);
            setExtensionStatus("");
            try {
              const report = await getExtensionReport({ data: { scanId: scanId.trim() } });
              setExtensionStatus(
                `${report.business}: ${report.reviews.length} eligible review drafts. Signed in as ${report.user.email}.`,
              );
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Extension report check failed.";
              setExtensionStatus(message);
              toast.error(message);
            } finally {
              setChecking(false);
            }
          }}
        >
          {checking ? "Checking..." : "Check report for extension"}
        </Button>
        <p role="status">{extensionStatus}</p>
      </section>
      <section className="surface grid gap-4 p-6 text-sm sm:grid-cols-5">
        <p>
          Total submitted: <b>{summary.total}</b>
        </p>
        <p>
          Approved: <b>{summary.approved}</b>
        </p>
        <p>
          Rejected: <b>{summary.rejected}</b>
        </p>
        <p>
          Pending: <b>{summary.pending}</b>
        </p>
        <p>
          Decided success rate:{" "}
          <b>
            {summary.decidedSuccessPercent === null ? "N/A" : `${summary.decidedSuccessPercent}%`}
          </b>
        </p>
      </section>
      <section className="surface my-4 overflow-x-auto p-4">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {["#", "Business", "Review", "Submitted", "Status", "Response", "Actions"].map(
                (title) => (
                  <th key={title} className="p-4">
                    {title}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {paging.rows.map((row, index) => (
              <tr key={row.id}>
                <td className="p-4">{(paging.page - 1) * 20 + index + 1}</td>
                <td className="p-4">
                  {data.scans.find((scan) => scan.id === row.scan_id)?.business_name ?? row.scan_id}
                </td>
                <td
                  className="max-w-64 truncate p-4"
                  title={
                    data.reviews.find((review) => review.id === row.review_id)?.text ??
                    row.review_id
                  }
                >
                  {data.reviews.find((review) => review.id === row.review_id)?.text ??
                    row.review_id}
                </td>
                <td className="whitespace-nowrap p-4">{compactDate(row.submitted_at)}</td>
                <td className="p-4">{row.outcome}</td>
                <td className="max-w-64 truncate p-4" title={row.verification_reference}>
                  {row.verification_reference}
                </td>
                <td className="p-4">
                  <Link
                    className="text-brand underline"
                    to="/reports/$id"
                    params={{ id: row.scan_id }}
                  >
                    View details
                  </Link>
                  {row.outcome === "rejected" &&
                    (() => {
                      const reviewUrl = data.reviews.find(
                        (review) => review.id === row.review_id,
                      )?.review_uri;
                      return reviewUrl && isGoogleMapsUrl(reviewUrl) ? (
                        <a
                          className="ml-3 text-brand underline"
                          href={reviewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open review in Google Maps
                        </a>
                      ) : null;
                    })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.outcomes.length && <p>No actual submissions recorded.</p>}
        <div className="mt-4 flex gap-3">
          <Button disabled={paging.page <= 1} onClick={() => setPage(paging.page - 1)}>
            Previous
          </Button>
          <span>
            Page {paging.page} / {paging.pages}
          </span>
          <Button disabled={paging.page >= paging.pages} onClick={() => setPage(paging.page + 1)}>
            Next
          </Button>
        </div>
      </section>
      <section className="surface p-6">
        <h2 className="font-semibold">In-app notifications</h2>
        <p className="text-sm">
          Email/WhatsApp delivery is not configured. Follow-up checks do not query Google decisions.
        </p>
        {data.notices.length ? (
          <ul>
            {data.notices.map((notice) => (
              <li key={notice.id} className="py-2">
                {compactDate(notice.created_at)}: {notice.message}
              </li>
            ))}
          </ul>
        ) : (
          <p>No submission events yet.</p>
        )}
      </section>
      <RemovalAnalytics />
    </>
  );
}
