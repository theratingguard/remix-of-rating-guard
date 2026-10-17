import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScanPage } from "../routes/_authenticated/scan";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  fetch: vi.fn(),
  analyze: vi.fn(),
  status: vi.fn(),
  find: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({ useSearch: () => ({}) }),
  useNavigate: () => mocks.navigate,
  Link: () => null,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === "report-access-level") return { data: "super_admin", isPending: false };
    if (queryKey[0] === "system-status")
      return { data: { googleConfigured: true }, isPending: false };
    if (queryKey[0] === "dashboard-scans") return { data: [], isFetching: false };
    return { data: undefined, isLoading: false, isFetching: false };
  },
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/scan.functions", () => ({
  scanFetch: mocks.fetch,
  scanAnalyze: mocks.analyze,
  getSystemStatus: mocks.status,
  findBusinesses: mocks.find,
}));
vi.mock("@/lib/data", () => ({
  scanQuery: (id: string) => ({ queryKey: ["scan", id] }),
  dashboardScansQuery: () => ({ queryKey: ["dashboard-scans"] }),
  scanRisk: () => "normal",
}));
vi.mock("@/lib/use-feature-settings", () => ({
  useFeatureSettings: () => ({
    data: {
      auto_pdf_enabled: false,
      bulk_scan_enabled: false,
      legal_expert_enabled: true,
    },
  }),
}));
vi.mock("@/components/restricted-report-summary", () => ({
  RestrictedReportSummary: () => null,
}));
vi.mock("@/lib/report-access", () => ({
  reportAccessQuery: () => ({ queryKey: ["report-access-level"] }),
}));
vi.mock("@/lib/regional-routing", () => ({
  isRegion: () => false,
  REGION_OPTIONS: [],
}));
vi.mock("@/lib/google-url", () => ({
  isGoogleMapsUrl: (url: string) => url.includes("google.com/maps/place/"),
  isGoogleReviewUrl: () => false,
}));
vi.mock("@/components/review-selection", () => ({ ReviewSelection: () => null }));
vi.mock("@/components/legal-analysis", () => ({ LegalAnalysisPanel: () => null }));
vi.mock("@/components/removal-summary", () => ({ RemovalSummary: () => null }));
vi.mock("@/components/scan-result", () => ({
  BusinessHeader: () => null,
  RatingAnalysis: () => null,
  RiskAnalysis: () => null,
}));
vi.mock("@/components/bulk-scan", () => ({ BulkScan: () => null }));
vi.mock("@/components/top-bar", () => ({ TopBar: () => null }));
vi.mock("@/components/scan-stats-cards", () => ({ ScanStatsCards: () => null }));
vi.mock("@/components/scan-progress", () => ({ ScanProgress: () => null }));
vi.mock("@/components/scanned-urls-table", () => ({ ScannedUrlsTable: () => null }));
vi.mock("@/components/right-panel", () => ({ RightPanel: () => null }));
vi.mock("@/components/simple-scan-report", () => ({ SimpleScanReport: () => null }));

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.fetch.mockReset();
  mocks.analyze.mockReset();
  mocks.status.mockReset().mockResolvedValue({ googleConfigured: true });
  mocks.find.mockReset();
  mocks.invalidateQueries.mockReset();
});

afterEach(cleanup);

describe("scan-to-report navigation", () => {
  it("opens the saved report route after scan and analysis both succeed", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, scanId: "scan-123" });
    mocks.analyze.mockResolvedValue({ ok: true, scanId: "scan-123", reviews: 5 });
    render(<ScanPage />);

    fireEvent.change(screen.getByLabelText("Paste URL"), {
      target: { value: "https://www.google.com/maps/place/Test+Business" },
    });
    fireEvent.submit(screen.getByLabelText("Paste URL").closest("form")!);

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/scan-report/$id",
        params: { id: "scan-123" },
      });
    });
  });

  it("does not open a report route and displays an error when scan fails", async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      code: "NOT_FOUND",
      message: "Business not found on Google.",
    });
    render(<ScanPage />);

    fireEvent.change(screen.getByLabelText("Paste URL"), {
      target: { value: "https://www.google.com/maps/place/Missing+Business" },
    });
    fireEvent.submit(screen.getByLabelText("Paste URL").closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent("Business not found on Google.");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("does not open a report route and displays an error when analysis fails", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, scanId: "scan-456" });
    mocks.analyze.mockResolvedValue({
      ok: false,
      code: "AI_UNAVAILABLE",
      message: "Review analysis is unavailable.",
    });
    render(<ScanPage />);

    fireEvent.change(screen.getByLabelText("Paste URL"), {
      target: { value: "https://www.google.com/maps/place/Test+Business" },
    });
    fireEvent.submit(screen.getByLabelText("Paste URL").closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent("Review analysis is unavailable.");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
