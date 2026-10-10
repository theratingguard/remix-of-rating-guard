import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";

export const reportAccessQuery = () =>
  queryOptions({
    queryKey: ["report-access-level"],
    queryFn: async () => {
      const result = await supabase.rpc("report_access_level").throwOnError();
      return result.data;
    },
  });

export function RestrictedReportSummary({ scanId }: { scanId?: string }) {
  const result = useQuery({
    queryKey: ["private-report-summaries"],
    queryFn: async () => (await supabase.rpc("private_report_summaries").throwOnError()).data,
  });
  if (result.error) return <p role="alert">Could not load summaries: {result.error.message}</p>;
  return (
    <section className="surface p-5">
      <span className="mb-3 inline-block rounded-full border px-3 py-1 text-xs font-semibold">
        Private Report
      </span>
      <h2 className="font-bold">Access Denied — detailed reports are private</h2>
      <p>
        Only theratingguard@gmail.com (Super Admin) can access details. All other accounts,
        including report owners, have summary-only access. Reviews, legal analysis and PDFs are not
        available.
      </p>
      <table className="mt-4 w-full">
        <thead>
          <tr>
            <th>Business</th>
            <th>Total reviews</th>
          </tr>
        </thead>
        <tbody>
          {result.data
            ?.filter((row) => !scanId || row.scan_id === scanId)
            .map((row) => (
              <tr key={row.scan_id}>
                <td>{row.business_name}</td>
                <td>{row.total_reviews ?? "—"}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </section>
  );
}
