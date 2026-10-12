import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import type { Scan, AnalyzedReview } from "@/lib/data";
import { ReviewSelection } from "./review-selection";
const generate = vi.fn();
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => generate }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(async () => {}) }),
}));
vi.mock("@/lib/review-selection.functions", () => ({ generateSelectedReport: {} }));
vi.mock("@/lib/private-report.functions", () => ({ downloadPrivateReport: {} }));
const scan = {
  id: "6736a5be-e460-4e01-bfed-839fcd714877",
  business_name: "Unit Business",
  maps_uri: "https://www.google.com/maps/?cid=123",
  status: "complete",
  is_seed: false,
} as Scan;
const reviews: AnalyzedReview[] = [1, 2, 3, 4, 5].map((rating) => ({
  id: `00000000-0000-4000-8000-00000000000${rating}`,
  author: `Reviewer ${rating}`,
  rating,
  text: `Original review ${rating}`,
  review_uri: null,
  published_at: null,
  relative_time: null,
  analysis: {
    risk: rating === 2 ? "high" : "requires_review",
    category: null,
    signals: [],
    reason: null,
    evidence: null,
    confidence: 50,
    model: null,
  },
}));
afterEach(() => vi.clearAllMocks());
describe("Manual review selection UI", () => {
  it("lists all five, bulk selects, filters and generates exactly two selected assessments", async () => {
    generate.mockResolvedValue({
      url: "https://ratingguard.online/reports/6736a5be-e460-4e01-bfed-839fcd714877_selected.pdf",
      selectedCount: 2,
      requests: reviews.slice(0, 2).map((review) => ({
        review_id: review.id,
        assessment: "insufficient_evidence",
        policy: "None",
        request_text: "No supported removal evidence",
        evidence: "",
        policy_reference: "https://support.google.com/contributionpolicy/answer/7400114",
      })),
    });
    render(<ReviewSelection scan={scan} reviews={reviews} report={null} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Select All" }));
    expect(screen.getByRole("status")).toHaveTextContent("5 reviews selected");
    fireEvent.click(screen.getByRole("button", { name: "Select 1-star only" }));
    expect(screen.getByRole("status")).toHaveTextContent("1 reviews selected");
    fireEvent.click(screen.getByRole("button", { name: "Clear All" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "flagged" } });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "all" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Select review by Reviewer 1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select review by Reviewer 2" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "selected" } });
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Prepare reports for selected reviews" }));
    await waitFor(() =>
      expect(screen.getByText("Saved selected report: 2 reviews")).toBeInTheDocument(),
    );
    expect(generate).toHaveBeenCalledWith({
      data: { scanId: scan.id, reviewIds: reviews.slice(0, 2).map((r) => r.id) },
    });
    expect(screen.getByRole("button", { name: "Save Selected PDF" })).toBeInTheDocument();
  });
});
