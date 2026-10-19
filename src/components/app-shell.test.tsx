import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: null }),
  useQueryClient: () => ({ cancelQueries: vi.fn(), clear: vi.fn() }),
}));

vi.mock("@/lib/profile", () => ({ profileQuery: () => ({ queryKey: ["profile"] }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut: vi.fn() } },
}));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => <>{children}</>,
  SheetContent: () => null,
}));

import { AppShell } from "./app-shell";

const staffLinks = [
  ["Overview", "/staff/today"],
  ["My Tasks", "/staff/tasks"],
  ["Status Board", "/staff/status-board"],
  ["Performance", "/staff/performance"],
  ["Quality", "/staff/quality"],
  ["Incentive", "/staff/wallet"],
  ["Communication", "/staff/communication"],
  ["My Activity", "/staff/activity"],
  ["Evidence Vault", "/staff/evidence"],
  ["Timeline", "/staff/timeline"],
  ["Team Review", "/staff/lead-activity"],
  ["Alerts", "/staff/alerts"],
  ["Profile", "/staff/profile"],
  ["Chats", "/chat"],
];

const adminLinks = [
  ["Dashboard", "/dashboard"],
  ["URL Scanner", "/scan"],
  ["Bulk URL Scan", "/scan"],
  ["Google Reviews", "/reports"],
  ["Risk Analysis", "/removal-center"],
  ["Scan History", "/history"],
  ["Reports", "/reports"],
  ["Storage Manager", "/storage"],
  ["Settings", "/settings"],
  ["Staff Approvals", "/admin/staff"],
  ["Resellers", "/admin/resellers"],
  ["Staff Activity", "/admin/staff-activity"],
  ["Chats", "/chat"],
];

afterEach(cleanup);

describe("AppShell role navigation", () => {
  it("renders only the staff navigation for staff", () => {
    render(
      <AppShell
        email="staff@example.com"
        userId="staff-id"
        isStaff
        isSuperAdmin={false}
        isClient={false}
        staffPendingCount={3}
      >
        <div>Page content</div>
      </AppShell>,
    );

    const navigation = within(screen.getByRole("navigation", { name: "Main navigation" }));
    expect(
      navigation
        .getAllByRole("link")
        .map((link) => [link.textContent?.trim(), link.getAttribute("href")]),
    ).toEqual(staffLinks);
    expect(screen.queryByText("Upgrade plan")).not.toBeInTheDocument();
    expect(screen.queryByText("Staff Approvals")).not.toBeInTheDocument();
    expect(screen.queryByText("Storage Manager")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("renders only the admin navigation for superadmins", () => {
    render(
      <AppShell
        email="admin@example.com"
        userId="admin-id"
        isStaff={false}
        isSuperAdmin
        isClient={false}
        staffPendingCount={3}
      >
        <div>Page content</div>
      </AppShell>,
    );

    const navigation = within(screen.getByRole("navigation", { name: "Main navigation" }));
    const actualLinks = navigation
      .getAllByRole("link")
      .map((link) => [link.textContent?.trim().replace(/\d+$/, ""), link.getAttribute("href")]);
    expect(actualLinks).toEqual(adminLinks);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Upgrade plan")).toBeInTheDocument();
    expect(screen.queryByText("Overview")).not.toBeInTheDocument();
    expect(screen.queryByText("My Tasks")).not.toBeInTheDocument();
  });

  it("does not expose admin navigation to users without an admin or staff role", () => {
    render(
      <AppShell
        email="user@example.com"
        userId="user-id"
        isStaff={false}
        isSuperAdmin={false}
        isClient={false}
        staffPendingCount={0}
      >
        <div>Page content</div>
      </AppShell>,
    );

    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeEmptyDOMElement();
    expect(screen.queryByText("Upgrade plan")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("shows only progress navigation to client accounts", () => {
    render(
      <AppShell
        email="client@example.com"
        userId="client-id"
        isStaff={false}
        isSuperAdmin={false}
        isClient
        staffPendingCount={0}
      >
        <div>Page content</div>
      </AppShell>,
    );

    const navigation = within(screen.getByRole("navigation", { name: "Main navigation" }));
    expect(navigation.getByRole("link", { name: "Review Outcomes" })).toHaveAttribute(
      "href",
      "/client/outcomes",
    );
    expect(navigation.queryByText("Evidence Vault")).not.toBeInTheDocument();
    expect(navigation.queryByText("Staff Activity")).not.toBeInTheDocument();
  });
});
