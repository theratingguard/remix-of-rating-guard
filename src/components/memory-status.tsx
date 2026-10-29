import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { clearPendingCaseMemory, getMemoryStats } from "@/lib/memory.functions";

export function MemoryStatus() {
  const stats = useServerFn(getMemoryStats);
  const clearPending = useServerFn(clearPendingCaseMemory);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["case-memory-stats"],
    queryFn: () => stats(),
    refetchInterval: 30000,
    retry: false,
  });
  async function clearPendingRecords() {
    if (
      !window.confirm(
        `Permanently remove ${query.data?.pending ?? 0} pending memory records? Source reviews and scans will remain unchanged.`,
      )
    )
      return;
    try {
      const result = await clearPending({ data: { confirmation: "CLEAR_PENDING_CASE_MEMORY" } });
      await queryClient.invalidateQueries({ queryKey: ["case-memory-stats"] });
      toast.success(
        `${result.cleared} pending memory record${result.cleared === 1 ? "" : "s"} cleared.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not clear pending case memory.");
    }
  }
  return (
    <section className="surface space-y-4 p-6">
      <h2 className="font-semibold">Memory Stats</h2>
      {query.error ? (
        <p role="alert">{query.error.message}</p>
      ) : !query.data ? (
        <p>Loading recorded case memory...</p>
      ) : (
        <>
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            <p>
              Total cases: <b>{query.data.total}</b>
            </p>
            <p>
              Successful: <b>{query.data.successful}</b>
            </p>
            <p>
              Failed: <b>{query.data.failed}</b>
            </p>
            <p>
              Pending: <b>{query.data.pending}</b>
            </p>
          </div>
          <p className="text-sm">Prediction accuracy: {query.data.accuracy_reason}</p>
          <Button
            type="button"
            variant="destructive"
            disabled={!query.data.pending}
            onClick={() => void clearPendingRecords()}
          >
            Clear pending memory records
          </Button>
          <p className="text-sm">
            Pending means no decided outcome recorded, not confirmed Google submission. Predictions
            require 10 comparable decided cases with evidence strength. Existing report predictions
            retain their 30-case safety threshold.
          </p>
        </>
      )}
    </section>
  );
}
