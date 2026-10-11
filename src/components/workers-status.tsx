import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWorkersStatus } from "@/lib/workers-status.functions";

export function WorkersStatus() {
  const status = useServerFn(getWorkersStatus);
  const query = useQuery({
    queryKey: ["workers-status"],
    queryFn: () => status(),
    refetchInterval: 5000,
    retry: false,
  });
  if (query.error)
    return (
      <section className="surface p-6">
        <h2>Workers Status</h2>
        <p role="alert">{query.error.message}</p>
      </section>
    );
  if (!query.data)
    return (
      <section className="surface p-6">
        <h2>Workers Status</h2>
        <p>Checking worker heartbeats...</p>
      </section>
    );
  const { data } = query,
    { stats } = data;
  return (
    <section className="surface space-y-4 p-6">
      <h2 className="font-semibold">Workers Status</h2>
      <p className="text-sm">
        Redis: {data.redis} · {(data.memory_bytes / 1048576).toFixed(1)}MB / 512MB · Health polling
        every 5s; logged checks every 5 minutes.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {data.workers.map((worker) => (
          <li key={worker.name} className="flex justify-between text-sm">
            <span>{worker.name}</span>
            <span
              className={
                worker.state === "active"
                  ? "text-risk-normal"
                  : worker.state === "idle"
                    ? "text-risk-medium"
                    : "text-risk-high"
              }
            >
              {worker.state === "active"
                ? "Active"
                : worker.state === "idle"
                  ? "Idle (ready)"
                  : "Unhealthy"}
            </span>
          </li>
        ))}
      </ul>
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <p>
          Total Jobs Today (UTC): <b>{stats.total}</b>
        </p>
        <p>
          Failed: <b>{stats.failed}</b> (
          {stats.total ? ((stats.failed / stats.total) * 100).toFixed(1) : "0"}%)
        </p>
        <p>
          Avg completed stage:{" "}
          <b>
            {stats.average_ms === null
              ? "Not available"
              : `${(stats.average_ms / 1000).toFixed(1)}s`}
          </b>
        </p>
      </div>
      <p className="text-sm">
        AI reserved today: ${(stats.reserved_usd ?? 0).toFixed(4)} / $10. Conservative token-cost
        reservations, not actual invoiced spend. Database REST requests: max {data.db_request_limit}{" "}
        globally.
      </p>
      <ul className="text-sm">
        {data.queues.map((queue) => (
          <li key={queue.stage}>
            {queue.stage}: concurrency {queue.concurrency} · waiting {queue.counts["waiting"] ?? 0}{" "}
            · active {queue.counts["active"] ?? 0} · delayed {queue.counts["delayed"] ?? 0} · failed{" "}
            {queue.counts["failed"] ?? 0}
          </li>
        ))}
      </ul>
    </section>
  );
}
