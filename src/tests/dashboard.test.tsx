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
        : queryKey[0] === "dashboard-outcome-counts"
          ? { approved: 0, rejected: 0 }
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
  EmptyState: () => null,
  StatusPill: () => null,
}));
vi.mock("@/components/review-ui", () => ({
  Stars: () => null,
  RiskBadge: () => null,
  DevTag: () => null,
  ratingTone: vi.fn(),
}));
vi.mock("@/components/ops-panels", () => ({ OperationsPanel: () => null }));
vi.mock("@/components/removal-workflow", () => ({
  RemovalAnalytics: () => <div data-testid="removal-analytics" />,
}));
vi.mock("@/components/smart-alerts", () => ({
  SmartAlerts: () => <div data-testid="smart-alerts" />,
}));
import { Route } from "@/routes/_authenticated/dashboard";

afterEach(cleanup);
it("renders four compact KPI cards before a single analytics and alerts panel", () => {
  const Dashboard = Route.options.component;
  if (!Dashboard) throw new Error("Dashboard component missing");
  render(<Dashboard />);
  for (const label of ["Total Scans", "Flagged Reviews", "Approved", "Success Rate"])
    expect(screen.getByText(label)).toBeInTheDocument();
  const analytics = screen.getAllByTestId("removal-analytics");
  expect(analytics).toHaveLength(1);
  expect(screen.getAllByTestId("smart-alerts")).toHaveLength(1);
  const firstCard = screen.getByText("Total Scans").parentElement;
  expect(firstCard).not.toContainElement(analytics[0]!);
  expect(screen.getByText("View Simple Report")).toBeInTheDocument();
  expect(screen.getByText("View Detailed Report")).toBeInTheDocument();
});
