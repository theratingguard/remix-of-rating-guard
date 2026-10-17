import type { ComponentType, ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => ({ options }),
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data:
      queryKey[0] === "access"
        ? "super_admin"
        : queryKey[0] === "scans"
          ? [
              {
                id: "scan-123",
                business_id: "business-123",
                business_name: "The Hudson",
                source_url: "https://example.com",
                status: "complete",
                error: null,
                created_at: "2026-01-01T00:00:00.000Z",
                is_seed: false,
                rating: 3.1,
                high_count: 1,
                medium_count: 0,
                normal_count: 0,
                requires_review_count: 0,
              },
            ]
          : queryKey[0] === "dashboard-review-actions"
            ? { reportEvents: 0, removed: 0 }
            : [],
    isLoading: false,
    isPending: false,
  }),
}));
vi.mock("@/lib/data", () => ({
  scansQuery: () => ({ queryKey: ["scans"] }),
  scanRisk: vi.fn(),
  fmtDate: vi.fn(),
  riskyCount: vi.fn(),
}));
vi.mock("@/components/restricted-report-summary", () => ({
  RestrictedReportSummary: () => null,
}));
vi.mock("@/lib/report-access", () => ({
  reportAccessQuery: () => ({ queryKey: ["access"] }),
}));
vi.mock("@/lib/use-feature-settings", () => ({
  useFeatureSettings: () => ({ data: { appeal_tracking_enabled: true } }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/app-shell", () => ({
  PageHeader: () => null,
}));
import { Route } from "@/routes/_authenticated/dashboard";

afterEach(cleanup);
it("renders only the requested four scan and report metrics", () => {
  const Dashboard = Route.options.component;
  if (!Dashboard) throw new Error("Dashboard component missing");
  render(<Dashboard />);
  for (const label of [
    "Total Scans",
    "Total Reports Sent",
    "Total Removed",
    "Overall Success Rate",
  ])
    expect(screen.getByText(label)).toBeInTheDocument();
  expect(screen.queryByText("Risk overview")).not.toBeInTheDocument();
  expect(screen.queryByText("Recent scans")).not.toBeInTheDocument();
});
