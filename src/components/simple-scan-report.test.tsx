import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SimpleScanReport } from "./simple-scan-report";
import { ExtensionLauncher } from "./extension-launcher";

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
  scanQuery: (id: string) => ({ queryKey: ["scan", id] }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));
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
    source_url: "https://www.google.com/maps/place/The+Hudson",
  },
  report: { id: "report-1" },
  reviews: [
    {
      id: "review-1",
      text: "A review to assess",
      author: "Reviewer",
      rating: 1,
      review_uri: null,
      analysis: {
        risk: "normal",
        category: null,
        signals: [],
        reason: "No supported concern identified.",
        evidence: null,
        confidence: 80,
        model: "gpt-4o",
      },
      legal: null,
    },
  ],
};

afterEach(() => {
  cleanup();
  sendReport.mockReset();
  scanData.reviews[0]!.analysis = {
    risk: "normal",
    category: null,
    signals: [],
    reason: "No supported concern identified.",
    evidence: null,
    confidence: 80,
    model: "gpt-4o",
  };
  scanData.scan.source_url = "https://www.google.com/maps/place/The+Hudson";
  scanData.reviews[0]!.review_uri = null;
});

describe("Simple scan report", () => {
  it("shows only the concise scan and review table before a report is prepared", () => {
    render(<SimpleScanReport scanId="scan-1" />);
    expect(screen.getByRole("heading", { name: "Scan Report" })).toBeInTheDocument();
    expect(screen.getAllByText("The Hudson")).toHaveLength(1);
    expect(screen.getByText(/3\.1.*123 fetched/)).toBeInTheDocument();
    expect(screen.getByText("REVIEWS")).toBeInTheDocument();
    expect(screen.getByText("A review to assess")).toBeInTheDocument();
    expect(screen.getByText("No supported signal found")).toBeInTheDocument();
    expect(screen.getByText("No report recommended")).toBeInTheDocument();
    expect(screen.getByText("Not estimated")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Prepare report" })).toBeNull();
    expect(screen.getByRole("button", { name: "Auto Report via Extension" })).toBeInTheDocument();
    expect(screen.getByText("SUBMITTED")).toBeInTheDocument();
    expect(screen.queryByText(/Legal strength|Evidence readiness|Multi-model voting/)).toBeNull();
  });

  it("offers a per-review report draft only for flagged reviews", () => {
    scanData.reviews[0]!.analysis = {
      risk: "medium",
      category: "Spam",
      signals: ["Promotional solicitation"],
      reason: "The review contains a direct promotional solicitation.",
      evidence: "Book now for a discount",
      confidence: 64,
      model: "llama3.2:3b",
    };
    render(<SimpleScanReport scanId="scan-1" />);

    expect(screen.getByText("Medium policy signal")).toBeInTheDocument();
    expect(screen.getByText(/llama3\.2:3b/)).toBeInTheDocument();
    expect(screen.getByText("Book now for a discount")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prepare report" })).toBeInTheDocument();
  });

  it("sends the selected review ID when preparing its report", async () => {
    sendReport.mockResolvedValue({});
    scanData.reviews[0]!.analysis = {
      risk: "medium",
      category: "Spam",
      signals: ["Promotional solicitation"],
      reason: "Supported signal",
      evidence: "Book now for a discount",
      confidence: 64,
      model: "llama3.2:3b",
    };
    render(<SimpleScanReport scanId="scan-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Prepare report" }));
    await waitFor(() =>
      expect(sendReport).toHaveBeenCalledWith({
        data: { scanId: "scan-1", reviewId: "review-1" },
      }),
    );
  });

  it("sends a token-free launch signal and links the setup guide when the extension is absent", async () => {
    vi.useFakeTimers();
    const postMessage = vi.spyOn(window, "postMessage");
    try {
      render(<ExtensionLauncher scanId="scan-1" />);
      fireEvent.click(screen.getByRole("button", { name: "Auto Report via Extension" }));
      expect(postMessage).toHaveBeenCalledWith(
        { source: "rating-guard-app", type: "open-assistant", scanId: "scan-1" },
        window.location.origin,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      expect(screen.getByRole("link", { name: "Install guide" })).toHaveAttribute(
        "href",
        "https://github.com/theratingguard/remix-of-rating-guard/blob/main/docs/extension-setup.md",
      );
    } finally {
      postMessage.mockRestore();
      vi.useRealTimers();
    }
  });

  it("generates a single-review copy-ready request only for an exact Google review URL match", () => {
    const targetUrl = "https://www.google.com/maps/reviews/data=!4m8!14m7!1m6!1sreview-id";
    scanData.scan.source_url = targetUrl;
    scanData.reviews[0]!.review_uri = `${targetUrl}#review`;
    scanData.reviews[0]!.analysis = {
      risk: "normal",
      category: null,
      signals: [],
      reason: "No supported concern identified.",
      evidence: null,
      confidence: 80,
      model: "gpt-4o",
    };

    render(<SimpleScanReport scanId="scan-1" />);

    expect(screen.getByText(/Exact review URL matched/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Copy-ready request for Google" }),
    ).toBeInTheDocument();
    expect(
      (screen.getByLabelText("Copy-ready single review request") as HTMLTextAreaElement).value,
    ).toContain("Please assess the complete review in context");
    expect(screen.getByRole("link", { name: "Open Google report form" })).toHaveAttribute(
      "href",
      "https://support.google.com/business/troubleshooter/2690762",
    );
    expect(screen.queryByText(/%|Not estimated|Not estimable/)).toBeNull();
    expect(screen.queryByText("Normal")).toBeNull();
  });

  it("does not invent review details when Google does not return the exact linked review", () => {
    scanData.scan.source_url = "https://www.google.com/maps/reviews/data=!4m8!1srequested-review";
    scanData.reviews[0]!.review_uri =
      "https://www.google.com/maps/reviews/data=!4m8!1sother-review";

    render(<SimpleScanReport scanId="scan-1" />);

    expect(screen.getByRole("alert")).toHaveTextContent(/did not return an exact match/);
    expect(screen.queryByRole("heading", { name: "Copy-ready request for Google" })).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByText("Normal")).toBeNull();
  });
});
