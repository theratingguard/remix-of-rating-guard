import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import type { LegalCountry } from "@/lib/legal-laws/country-laws";
import { getLegalWorkers, setLegalWorkerEnabled } from "@/lib/worker-manager.functions";
import { reportAccessQuery } from "./restricted-report-summary";
import { Button } from "./ui/button";

export function LegalWorkersPanel() {
  const access = useQuery(reportAccessQuery());
  const loadWorkers = useServerFn(getLegalWorkers);
  const setEnabled = useServerFn(setLegalWorkerEnabled);
  const cache = useQueryClient();
  const [busyCountry, setBusyCountry] = useState<string | null>(null);
  const workers = useQuery({
    queryKey: ["legal-workers"],
    queryFn: () => loadWorkers(),
    enabled: access.data === "super_admin",
    retry: false,
  });

  async function toggle(country: LegalCountry, enabled: boolean) {
    setBusyCountry(country);
    try {
      await setEnabled({ data: { country, enabled } });
      await cache.invalidateQueries({ queryKey: ["legal-workers"] });
      toast.success(`${country} legal worker ${enabled ? "enabled" : "disabled"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the legal worker.");
    } finally {
      setBusyCountry(null);
    }
  }

  if (access.data !== "super_admin") return null;

  return (
    <section className="surface mt-6 space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold">Legal Workers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Twenty built-in jurisdiction strategies use local templates and the shared legal workflow.
          No country-specific process, paid API, or automatic submission is started.
        </p>
      </div>
      {workers.error && <p role="alert">Worker data unavailable: {workers.error.message}</p>}
      {workers.isPending && <p role="status">Loading country workers…</p>}
      {workers.data && (
        <>
          <p role="status">
            Enabled country workers: {workers.data.filter((worker) => worker.enabled).length}/
            {workers.data.length}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-3 py-2">Country</th>
                  <th className="px-3 py-2">Worker</th>
                  <th className="px-3 py-2">Recorded cases</th>
                  <th className="px-3 py-2">Resolved success</th>
                  <th className="px-3 py-2">Avg. response days</th>
                  <th className="px-3 py-2">Management</th>
                </tr>
              </thead>
              <tbody>
                {workers.data.map((worker) => (
                  <tr key={worker.country} className="border-b last:border-0">
                    <th scope="row" className="px-3 py-3 font-medium">
                      <span>{worker.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{worker.country}</span>
                    </th>
                    <td className="px-3 py-3">
                      <span
                        className={worker.enabled ? "text-risk-normal" : "text-muted-foreground"}
                      >
                        {worker.enabled ? "● Active" : "○ Disabled"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {worker.cases} scans / {worker.submissions} submissions
                    </td>
                    <td className="px-3 py-3">
                      {worker.success_rate === null
                        ? "—"
                        : `${worker.success_rate}% (${worker.approved}/${worker.resolved})`}
                      {worker.pending ? ` · ${worker.pending} pending` : ""}
                    </td>
                    <td className="px-3 py-3">
                      {worker.average_days_to_response == null
                        ? "—"
                        : worker.average_days_to_response.toFixed(1)}
                    </td>
                    <td className="px-3 py-3">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyCountry !== null}
                        onClick={() => void toggle(worker.country, !worker.enabled)}
                      >
                        {busyCountry === worker.country
                          ? "Saving…"
                          : worker.enabled
                            ? "Disable"
                            : "Enable"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Success and response-time figures use manually recorded, resolved Google outcomes only. They
        are descriptive historical summaries, not predictions. Legal references are informational,
        not removal entitlements or legal advice.
      </p>
    </section>
  );
}
