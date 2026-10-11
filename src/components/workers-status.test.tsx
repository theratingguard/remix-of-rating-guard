import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
const status = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/workers-status.functions", () => ({ getWorkersStatus: status }));
import { WorkersStatus } from "./workers-status";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("shows real ready/active workers and measured zero-case stats without sample numbers", async () => {
  status.mockResolvedValue({
    redis: "PONG",
    memory_bytes: 2097152,
    budget_limit_usd: 10,
    db_request_limit: 20,
    workers: [
      { name: "scanner-worker-1", state: "idle" },
      { name: "analyzer-worker-1", state: "active" },
      { name: "legal-worker-1", state: "unhealthy" },
    ],
    stats: { total: 0, failed: 0, average_ms: null, reserved_usd: 0 },
    queues: [],
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WorkersStatus />
    </QueryClientProvider>,
  );
  await screen.findByText("scanner-worker-1");
  expect(screen.getByText("Idle (ready)")).toBeInTheDocument();
  expect(screen.getByText("Active")).toBeInTheDocument();
  expect(screen.getByText("Unhealthy")).toBeInTheDocument();
  expect(screen.queryByText("1,245")).not.toBeInTheDocument();
  expect(screen.getByText("Not available")).toBeInTheDocument();
});
