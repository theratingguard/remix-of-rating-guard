import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, it, expect, vi } from "vitest";
const api = vi.hoisted(() => ({ errors: vi.fn(), save: vi.fn(), retry: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/components/review-ui", () => ({
  RiskBadge: () => null,
  DevTag: () => null,
  Confidence: () => null,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/lib/ops.functions", () => ({
  getErrorCenter: api.errors,
  setErrorStatus: api.save,
  retryErrorScan: api.retry,
  getOperations: vi.fn(),
  getActionCenter: vi.fn(),
  setActionStatus: vi.fn(),
  getQualityCenter: vi.fn(),
  getSystemQuality: vi.fn(),
  getScanEvents: vi.fn(),
}));
import { ErrorCenter } from "./ops-panels";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("Filterable actionable error groups", () => {
  it("groups repeated codes, filters severity/date, displays time and retries/resolves each record", async () => {
    const base = {
      id: "error-1",
      created_at: "2026-10-11T04:30:25Z",
      module: "google",
      route: "scan",
      scan_id: "scan-1",
      business: "Hudson",
      code: "UNSUPPORTED_LINK",
      message: "Exact resolution failed",
      severity: "LOW",
      status: "OPEN",
    };
    api.errors.mockResolvedValue([
      base,
      { ...base, id: "error-2" },
      {
        ...base,
        id: "ai",
        module: "ai",
        code: "AI_UNAVAILABLE",
        severity: "HIGH",
        created_at: "2026-10-10T00:00:00Z",
      },
    ]);
    api.save.mockResolvedValue({ ok: true });
    api.retry.mockResolvedValue({ scanId: "scan-1", message: "Retry completed." });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ErrorCenter />
      </QueryClientProvider>,
    );
    await screen.findByText(/UNSUPPORTED_LINK × 2/);
    fireEvent.click(screen.getByText(/UNSUPPORTED_LINK × 2/));
    expect(screen.getAllByText(/11 Oct 2026/)).toHaveLength(2);
    expect(screen.getAllByText("Exact resolution failed")).toHaveLength(3);
    fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]!);
    await waitFor(() => expect(api.retry).toHaveBeenCalledWith({ data: { errorId: "error-1" } }));
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Mark as Resolved" })[0]).not.toBeDisabled(),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Mark as Resolved" })[0]!);
    await waitFor(() =>
      expect(api.save).toHaveBeenCalledWith({ data: { id: "error-1", status: "FIXED" } }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Error severity" }), {
      target: { value: "HIGH" },
    });
    expect(screen.queryByText(/UNSUPPORTED_LINK ×/)).not.toBeInTheDocument();
    expect(screen.getByText(/AI_UNAVAILABLE × 1/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-11" } });
    expect(screen.getByText("No errors match these filters.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByText(/UNSUPPORTED_LINK × 2/)).toBeInTheDocument();
  });
});
