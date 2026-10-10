import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
const api = vi.hoisted(() => ({
  enqueue: vi.fn(),
  load: vi.fn(),
  control: vi.fn(),
  retry: vi.fn(),
  latest: vi.fn(async () => null),
}));
vi.mock("@/lib/queue.functions", () => ({
  enqueueBatch: api.enqueue,
  getBatchJobs: api.load,
  controlBatch: api.control,
  retryJob: api.retry,
  latestBatch: api.latest,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
import { BulkScan } from "./bulk-scan";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("Durable bulk UI", () => {
  it("admits 150 business-name lines and exposes two input modes", () => {
    render(<BulkScan disabled={false} />);
    fireEvent.change(screen.getByLabelText("URLs or business names (one per line)"), {
      target: {
        value: Array.from({ length: 150 }, (_, index) => `Business ${index} City`).join("\n"),
      },
    });
    expect(screen.getByText(/150 inputs/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Bulk Scan" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "PDF Upload" }));
    expect(screen.getByLabelText("Bulk PDF file")).toHaveAttribute(
      "accept",
      "application/pdf,.pdf",
    );
  });
  it("shows persisted progress, fetched stars, removal counts and owner batch controls", async () => {
    api.enqueue.mockResolvedValue({
      ok: true,
      batch: { id: "00000000-0000-4000-8000-000000000001", batch_number: 1 },
    });
    api.load.mockResolvedValue({
      controlStatus: "running",
      paused: false,
      jobs: [
        {
          id: "unit",
          url: "The Hudson Albany",
          status: "pending",
          stars: [3, 0, 0, 0, 2],
          removal: { high: 0, medium: 0, low: 5 },
          scan: { business_name: "The Hudson", rating: 3.2, reviews_retrieved: 5 },
        },
      ],
    });
    api.control.mockResolvedValue({ ok: true });
    render(<BulkScan disabled={false} />);
    fireEvent.change(screen.getByLabelText("URLs or business names (one per line)"), {
      target: { value: "The Hudson Albany" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start Bulk Scan" }));
    await waitFor(() => expect(screen.getByRole("progressbar")).toHaveAttribute("value", "0"));
    expect(screen.getByRole("columnheader", { name: "1★" })).toBeInTheDocument();
    expect(screen.getByText("🔴 0 / 🟠 0 / 🟡 5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() =>
      expect(api.control).toHaveBeenCalledWith({
        data: { batchId: "00000000-0000-4000-8000-000000000001", action: "pause" },
      }),
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
  });
});
