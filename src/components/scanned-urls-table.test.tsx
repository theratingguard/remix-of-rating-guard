import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScanRow } from "@/lib/data";
import { ScannedUrlsTable } from "./scanned-urls-table";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    params?: { id: string };
    children: React.ReactNode;
  }) => (
    <a href={params ? `/reports/${params.id}` : undefined} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/app-shell", () => ({
  StatusPill: ({ status }: { status: string }) => <span>{status}</span>,
}));

afterEach(cleanup);

function scan(id: string, name: string, risk: "high" | "medium" | "normal"): ScanRow {
  return {
    id,
    business_name: name,
    source_url: `https://maps.google.com/${id}`,
    address: "Albany, NY",
    status: "complete",
    rating: 4.2,
    reviews_retrieved: 5,
    high_count: risk === "high" ? 1 : 0,
    medium_count: risk === "medium" ? 1 : 0,
    normal_count: risk === "normal" ? 5 : 0,
    requires_review_count: 0,
    created_at: "2026-10-12T10:00:00.000Z",
    reports: null,
  } as ScanRow;
}

describe("scanned URL table", () => {
  it("filters scan rows by search and risk, paginates, and links to each report", () => {
    const scans = [
      scan("1", "High Risk Cafe", "high"),
      scan("2", "Medium Risk Hotel", "medium"),
      ...Array.from({ length: 10 }, (_, index) =>
        scan(`${index + 3}`, `Normal Shop ${index}`, "normal"),
      ),
    ];
    const onRiskFilterChange = vi.fn();
    render(
      <ScannedUrlsTable
        scans={scans}
        search=""
        location=""
        risk="all"
        onRiskFilterChange={onRiskFilterChange}
        onRefresh={vi.fn()}
        isRefreshing={false}
      />,
    );

    expect(screen.getByText("Showing 1 to 10 of 12 results")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Showing 11 to 12 of 12 results")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /View/ })[1]).toHaveAttribute("href", "/reports/12");

    fireEvent.change(screen.getByRole("combobox", { name: "All risk levels" }), {
      target: { value: "high" },
    });
    expect(onRiskFilterChange).toHaveBeenCalledWith("high");
  });

  it("shows a useful empty state when no scans match", () => {
    render(
      <ScannedUrlsTable
        scans={[]}
        search="no match"
        location=""
        risk="all"
        onRiskFilterChange={vi.fn()}
        onRefresh={vi.fn()}
        isRefreshing={false}
      />,
    );
    expect(screen.getByText("No scans match these filters.")).toBeInTheDocument();
    expect(screen.getByText("Showing 0 to 0 of 0 results")).toBeInTheDocument();
  });
});
