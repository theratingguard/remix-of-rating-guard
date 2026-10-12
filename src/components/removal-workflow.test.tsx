import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemovalAnalytics, RemovalSubmissionForm } from "./removal-workflow";
import { unsupportedLegalReview } from "@/lib/legal-analysis";
import type { AnalyzedReview, Scan } from "@/lib/data";
const state = vi.hoisted(() => ({
  query: { data: { outcomes: [], appeals: [] }, error: null, isPending: false },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => state.query,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-start")>()),
  useServerFn: () => vi.fn(),
}));
vi.mock("@/lib/appeal.functions", () => ({ generateAppealDraft: {} }));
afterEach(cleanup);
describe("Verified removal workflow UI", () => {
  it("shows empty real analytics instead of sample success numbers", () => {
    render(<RemovalAnalytics />);
    expect(screen.getByText(/No real submissions recorded/)).toBeInTheDocument();
    expect(screen.getByText(/no decisions/)).toBeInTheDocument();
    expect(screen.getByText(/A due reminder is not a rejection/)).toBeInTheDocument();
    expect(screen.getByText(/not Google responses/)).toBeInTheDocument();
  });
  it("makes actual submission a separate explicit action, not a Google link click", () => {
    const scan = { id: "fixture", status: "complete", category: "Hotel" } as Scan;
    const review = {
      id: "fixture",
      author: "Fixture",
      rating: 1,
      analysis: null,
    } as AnalyzedReview;
    render(
      <RemovalSubmissionForm scan={scan} review={review} legal={unsupportedLegalReview(review)} />,
    );
    expect(
      screen.getByRole("button", { name: "Record Actual Google Submission" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Manually recorded submission/)).not.toBeInTheDocument();
  });
});
