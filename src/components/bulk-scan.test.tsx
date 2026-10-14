import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
const api = vi.hoisted(() => ({
  enqueue: vi.fn(),
  load: vi.fn(),
  control: vi.fn(),
  retry: vi.fn(),
  latest: vi.fn(async () => null),
  saveCsv: vi.fn(),
}));
vi.mock("@/lib/queue.functions", () => ({
  enqueueBatch: api.enqueue,
  getBatchJobs: api.load,
  controlBatch: api.control,
  retryJob: api.retry,
  latestBatch: api.latest,
}));
vi.mock("@/lib/storage.functions", () => ({ uploadStorageFile: api.saveCsv }));
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
          removal: { high: 0, medium: 0, low: 5, notEstimable: 0 },
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
          removal: { high: 0, medium: 0, low: 0, notEstimable: 0 },
          scan: null,
          reportUrl: null,
        },
        {
          id: "failed",
          url: "Failed City",
          status: "failed",
          error: "Exact fixture failure",
          stars: [0, 0, 0, 0, 0],
          removal: { high: 0, medium: 0, low: 0, notEstimable: 0 },
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
    expect(screen.getByText("🔴 0 / 🟠 0 / 🟡 5 / N/E 0")).toBeInTheDocument();
    expect(screen.getByText("5 of 120")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() =>
      expect(api.control).toHaveBeenCalledWith({
        data: { batchId: "00000000-0000-4000-8000-000000000001", action: "pause" },
      }),
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save CSV to VPS" })).toBeInTheDocument();
    api.saveCsv.mockResolvedValue({
      folder: "reports/owner",
      url: "/storage/reports/owner/bulk-batch.csv",
    });
    fireEvent.click(screen.getByRole("button", { name: "Save CSV to VPS" }));
    await waitFor(() =>
      expect(api.saveCsv).toHaveBeenCalledWith({
        data: expect.objectContaining({
          folder: "reports",
          filename: "bulk-00000000-0000-4000-8000-000000000001.csv",
          contentType: "text/csv;charset=utf-8",
        }),
      }),
    );
    const request = api.saveCsv.mock.calls[0]?.[0] as { data: { base64: string } } | undefined;
    if (!request) throw new Error("CSV storage request was not created.");
    const binary = atob(request.data.base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const csv = new TextDecoder().decode(bytes);
    expect(screen.getByRole("link", { name: "Open or download CSV" })).toHaveAttribute(
      "href",
      "/api/storage/download?folder=reports%2Fowner&filename=bulk-00000000-0000-4000-8000-000000000001.csv",
    );
    expect(document.querySelector("a[download]")).toBeNull();
    expect(csv.split("\r\n")[0]).toContain('"Report URL"');
    expect(csv).toContain(
      "https://ratingguard.online/reports/00000000-0000-4000-8000-000000000002",
    );
    expect(csv).toContain('"3","","Failed City"');
    expect(csv).toContain('"failed","Exact fixture failure"');
  });
});
