import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  workspace: {
    clients: [
      {
        id: "client-row",
        businessId: "business-id",
        ownerName: "Owner",
        ownerEmail: "owner@example.com",
        ownerMobile: "+254700000000",
        teamLeaderId: null,
        createdAt: "2026-10-31T00:00:00Z",
        name: "Demo Business",
        mapsUrl: "https://maps.google.com/maps/place/demo",
        placeId: null,
        address: null,
        teamLeaderName: null,
      },
    ],
    teamLeaders: [
      {
        id: "leader-id",
        teamId: "team-id",
        uniqueId: "123456",
        name: "Demo Leader",
        email: "leader@example.com",
        mobile: "+254700000001",
        status: "active",
        memberCount: 0,
      },
    ],
    teamMembers: [],
  },
  invalidateQueries: vi.fn(),
  assignResellerBusiness: vi.fn(),
  createResellerBusiness: vi.fn(),
  createResellerStaffMember: vi.fn(),
  createResellerTeamLeader: vi.fn(),
  getResellerWorkspace: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.workspace, isPending: false, isFetching: false }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("@/lib/reseller.functions", () => ({
  assignResellerBusiness: mocks.assignResellerBusiness,
  createResellerBusiness: mocks.createResellerBusiness,
  createResellerStaffMember: mocks.createResellerStaffMember,
  createResellerTeamLeader: mocks.createResellerTeamLeader,
  getResellerWorkspace: mocks.getResellerWorkspace,
}));

import { ResellerWorkspaceTools } from "./reseller-workspace-tools";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Reseller workspace actions", () => {
  it("opens the business form and lists the reseller's clients", () => {
    render(<ResellerWorkspaceTools />);

    expect(screen.getByRole("heading", { name: "My Clients" })).toBeInTheDocument();
    expect(screen.getByText("Demo Business")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Business" }));

    expect(screen.getByLabelText("Business name")).toBeInTheDocument();
    expect(screen.getByLabelText("Google Maps URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Owner name")).toBeInTheDocument();
    expect(screen.getByLabelText("Owner email")).toBeInTheDocument();
    expect(screen.getByLabelText("Owner phone")).toBeInTheDocument();
  });

  it("opens Team Leader and Staff/Member creation forms", () => {
    render(<ResellerWorkspaceTools />);

    fireEvent.click(screen.getByRole("button", { name: "Add Team Leader" }));
    expect(screen.getByLabelText("Team Leader name")).toBeInTheDocument();
    expect(screen.getByLabelText("Login email")).toBeInTheDocument();
    expect(screen.getByLabelText("Initial password")).toBeInTheDocument();
    cleanup();

    render(<ResellerWorkspaceTools />);
    fireEvent.click(screen.getByRole("button", { name: "Add Staff/Member" }));
    expect(screen.getByLabelText("Team Leader")).toBeInTheDocument();
    expect(screen.getByLabelText("Staff/Member name")).toBeInTheDocument();
  });

  it("offers a business assignment selector for a reseller Team Leader", () => {
    render(<ResellerWorkspaceTools />);

    expect(screen.getByLabelText("Assign work to Team Leader")).toHaveValue("");
    expect(screen.getByRole("option", { name: "Demo Leader · 123456" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assign Work" })).toBeInTheDocument();
  });
});
