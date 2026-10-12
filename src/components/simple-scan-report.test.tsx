import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SimpleScanReport } from "./simple-scan-report";

const sendReport = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === "report-access-level") return { data: "super_admin", isPending: false };
    if (queryKey[0] === "scan") return { data: scanData, isLoading: false };
    return { data: [], isLoading: false };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => sendReport }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/data", () => ({
  GOOGLE_REPORT_URL: "https://support.google.com/business/workflow/9945796",
  scanQuery: (id: string) => ({ queryKey: ["scan", id] }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/report-pdf.functions", () => ({ saveReportPdf: {} }));
vi.mock("@/lib/use-feature-settings", () => ({
  useFeatureSettings: () => ({
    data: { legal_expert_enabled: true, appeal_tracking_enabled: true },
  }),
}));
vi.mock("@/components/restricted-report-summary", () => ({
  reportAccessQuery: () => ({ queryKey: ["report-access-level"] }),
  RestrictedReportSummary: () => null,
}));
vi.mock("@/components/removal-workflow", () => ({ RemovalSubmissionForm: () => null }));

const scanData = {
  scan: {
    id: "scan-1",
    status: "complete",
    is_seed: false,
    business_name: "The Hudson",
    rating: 3.1,
    total_reviews: 123,
  },
  report: { id: "report-1" },
  reviews: [
    {
      id: "review-1",
      text: "A review to assess",
      author: "Reviewer",
      rating: 1,
      analysis: { category: "Spam" },
      legal: null,
    },
  ],
};

afterEach(() => {
  cleanup();
  sendReport.mockReset();
});

describe("Simple scan report", () => {
  it("shows only the concise scan and review table before a report is prepared", () => {
    render(<SimpleScanReport scanId="scan-1" />);
    expect(screen.getByRole("heading", { name: "Scan Report" })).toBeInTheDocument();
    expect(screen.getAllByText("The Hudson")).toHaveLength(2);
    expect(screen.getByText(/3\.1.*123 fetched/)).toBeInTheDocument();
    expect(screen.getByText("REVIEWS")).toBeInTheDocument();
    expect(screen.getByText("A review to assess")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
    expect(screen.getByText("SUBMITTED")).toBeInTheDocument();
    expect(screen.queryByText(/Legal strength|Evidence readiness|Multi-model voting/)).toBeNull();
  });
});
