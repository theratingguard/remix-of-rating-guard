import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RestrictedReportSummary } from "./restricted-report-summary";

vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: unknown) => options,
  useQuery: () => ({
    data: [
      { scan_id: "first", business_name: "The Hudson", total_reviews: 120 },
      { scan_id: "second", business_name: "Other Business", total_reviews: 25 },
    ],
    error: null,
  }),
}));
afterEach(cleanup);
describe("Super Admin only report summaries", () => {
  it("shows business summaries to ordinary owners without detailed-report controls", () => {
    render(<RestrictedReportSummary />);
    expect(screen.getByText("Private Report")).toBeInTheDocument();
    expect(screen.getByText(/including report owners/)).toBeInTheDocument();
    expect(screen.getByText("The Hudson")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("Other Business")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Business",
      "Total reviews",
    ]);
    expect(screen.queryByRole("button", { name: "Save PDF" })).not.toBeInTheDocument();
  });
  it("shows only the requested business summary on a private detail route", () => {
    render(<RestrictedReportSummary scanId="first" />);
    expect(screen.getByText("The Hudson")).toBeInTheDocument();
    expect(screen.queryByText("Other Business")).not.toBeInTheDocument();
  });
});
