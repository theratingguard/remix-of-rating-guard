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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Durable bulk UI", () => {
  it("admits 1,001 business-name lines and exposes three input modes", () => {
    render(<BulkScan disabled={false} />);
    fireEvent.change(screen.getByLabelText("URLs or business names (one per line)"), {
      target: {
        value: Array.from({ length: 1001 }, (_, index) => `Business ${index} City`).join("\n"),
      },
    });
    expect(screen.getByText(/1001 inputs/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Bulk Scan" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "PDF Upload" }));
    expect(screen.getByLabelText("Bulk PDF file")).toHaveAttribute(
      "accept",
      "application/pdf,.pdf",
    );
    fireEvent.click(screen.getByRole("button", { name: "CSV / Excel Import" }));
    expect(screen.getByLabelText("Bulk CSV or Excel file")).toHaveAttribute("accept", ".csv,.xlsx");
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
          status: "completed",
          reportUrl: "https://ratingguard.online/reports/00000000-0000-4000-8000-000000000002",
          stars: [3, 0, 0, 0, 2],
          removal: { high: 0, medium: 0, low: 5 },
          scan: {
            business_name: "The Hudson",
            rating: 3.2,
            reviews_retrieved: 5,
            total_reviews: 120,
          },
        },
        {
          id: "pending",
          url: "Pending City",
          status: "pending",
          stars: [0, 0, 0, 0, 0],
          removal: { high: 0, medium: 0, low: 0 },
          scan: null,
          reportUrl: null,
        },
        {
          id: "failed",
          url: "Failed City",
          status: "failed",
          error: "Exact fixture failure",
          stars: [0, 0, 0, 0, 0],
          removal: { high: 0, medium: 0, low: 0 },
          scan: { business_name: null, rating: null, reviews_retrieved: 0, total_reviews: null },
          reportUrl: null,
        },
      ],
    });
    api.control.mockResolvedValue({ ok: true });
    render(<BulkScan disabled={false} />);
    fireEvent.change(screen.getByLabelText("URLs or business names (one per line)"), {
      target: { value: "The Hudson Albany" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start Bulk Scan" }));
    await waitFor(() => expect(screen.getByRole("progressbar")).toHaveAttribute("value", "2"));
    expect(screen.getByRole("columnheader", { name: "1★" })).toBeInTheDocument();
    expect(screen.getByText("🔴 0 / 🟠 0 / 🟡 5")).toBeInTheDocument();
    expect(screen.getByText("5 of 120")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() =>
      expect(api.control).toHaveBeenCalledWith({
        data: { batchId: "00000000-0000-4000-8000-000000000001", action: "pause" },
      }),
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
    const createObjectURL = vi.fn((_blob: Blob) => "blob:unit-csv");
    vi.stubGlobal(
      "URL",
      class extends URL {
        static override createObjectURL = createObjectURL;
        static override revokeObjectURL = vi.fn();
      },
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.isConnected).toBe(true);
      expect(this.download).toBe("bulk-00000000-0000-4000-8000-000000000001.csv");
    });
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[href="blob:unit-csv"]')).toBeNull();
    const blob = createObjectURL.mock.calls[0]?.[0];
    if (!blob) throw new Error("CSV blob was not created.");
    const csv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(csv.split("\r\n")[0]).toContain('"Report URL"');
    expect(csv).toContain(
      "https://ratingguard.online/reports/00000000-0000-4000-8000-000000000002",
    );
    expect(csv.split("\r\n").find((row) => row.includes("Failed City"))).toBe(
      '"3","","Failed City","","","","","","","","","","","","","failed","Exact fixture failure"',
    );
  });
});
