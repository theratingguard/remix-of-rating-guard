import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMemoryStats } from "@/lib/memory.functions";

export function MemoryStatus() {
  const stats = useServerFn(getMemoryStats);
  const query = useQuery({
    queryKey: ["case-memory-stats"],
    queryFn: () => stats(),
    refetchInterval: 30000,
    retry: false,
  });
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
