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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function scan(
  id: string,
  name: string,
  risk: "high" | "medium" | "normal",
  overrides: Partial<ScanRow> = {},
): ScanRow {
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
    region: "OTHER",
    ...overrides,
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
    const view = render(
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

  it("filters country, rating, risk, and business name, and sorts alphabetically", () => {
    const scans = [
      scan("1", "Zulu Pakistan Cafe", "medium", {
        region: "OTHER",
        rating: 3.1,
        address: "Lahore, Pakistan",
      }),
      scan("2", "Alpha India Hotel", "high", {
        region: "IN",
        rating: 4.8,
        address: "Delhi, India",
      }),
      scan("3", "Mike USA Shop", "normal", {
        region: "US",
        rating: 2.2,
        address: "Albany, USA",
      }),
    ];
    const onRiskFilterChange = vi.fn();
    const view = render(
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

    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Alpha India Hotel");
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by country" }), {
      target: { value: "PK" },
    });
    expect(screen.getByText("Zulu Pakistan Cafe")).toBeInTheDocument();
    expect(screen.queryByText("Alpha India Hotel")).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by rating" }), {
      target: { value: "3" },
    });
    expect(screen.getByText("Showing 1 to 1 of 1 results")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "All risk levels" }), {
      target: { value: "medium" },
    });
    expect(onRiskFilterChange).toHaveBeenCalledWith("medium");
    view.rerender(
      <ScannedUrlsTable
        scans={scans}
        search=""
        location=""
        risk="medium"
        onRiskFilterChange={onRiskFilterChange}
        onRefresh={vi.fn()}
        isRefreshing={false}
      />,
    );
    expect(screen.getByText("Showing 1 to 1 of 1 results")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search business name" }), {
      target: { value: "not found" },
    });
    expect(screen.getByText("No scans match these filters.")).toBeInTheDocument();
  });

  it("supports reverse alphabetical sorting and compact table sizing", () => {
    const scans = [
      scan("1", "Alpha Cafe", "normal"),
      scan("2", "Zulu Hotel", "normal"),
      scan("3", "Beta France Hotel", "normal", { region: "FR", address: "Paris, France" }),
    ];
    render(
      <ScannedUrlsTable
        scans={scans}
        search=""
        location=""
        risk="all"
        onRiskFilterChange={vi.fn()}
        onRefresh={vi.fn()}
        isRefreshing={false}
      />,
    );
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Alpha Cafe");
    expect(screen.getByText("France")).toBeInTheDocument();
    expect(screen.getAllByRole("row")[1]).toHaveClass("h-10");
    expect(screen.getByRole("columnheader", { name: "Business name" })).toHaveClass("font-bold");
    fireEvent.change(screen.getByRole("combobox", { name: "Sort businesses" }), {
      target: { value: "desc" },
    });
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Zulu Hotel");
  });

  it("filters calendar ranges using local scan dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T12:00:00"));
    const scans = [
      scan("today", "Today Business", "normal", { created_at: "2026-10-14T08:00:00.000Z" }),
      scan("week", "This Week Business", "normal", { created_at: "2026-10-13T08:00:00.000Z" }),
      scan("month", "Earlier Business", "normal", { created_at: "2026-10-08T08:00:00.000Z" }),
    ];
    render(
      <ScannedUrlsTable
        scans={scans}
        search=""
        location=""
        risk="all"
        onRiskFilterChange={vi.fn()}
        onRefresh={vi.fn()}
        isRefreshing={false}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Filter by date" }), {
      target: { value: "week" },
    });
    expect(screen.getByText("Showing 1 to 2 of 2 results")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by date" }), {
      target: { value: "today" },
    });
    expect(screen.getByText("Showing 1 to 1 of 1 results")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by date" }), {
      target: { value: "month" },
    });
    expect(screen.getByText("Showing 1 to 3 of 3 results")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by date" }), {
      target: { value: "custom" },
    });
    fireEvent.change(screen.getByLabelText("Start date"), {
      target: { value: "2026-10-13" },
    });
    fireEvent.change(screen.getByLabelText("End date"), {
      target: { value: "2026-10-14" },
    });
    expect(screen.getByText("Showing 1 to 2 of 2 results")).toBeInTheDocument();
  });
});
