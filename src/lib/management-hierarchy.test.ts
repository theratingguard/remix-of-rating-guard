import { describe, expect, it } from "vitest";
import {
  getHierarchyChildRole,
  getHierarchyDashboardPath,
  getHierarchyRole,
} from "./management-hierarchy";

describe("management hierarchy", () => {
  it.each([
    ["global", "global_manager"],
    ["country", "country_manager"],
    ["state", "state_manager"],
    ["division", "divisional_manager"],
    ["divisional", "divisional_manager"],
    ["district", "district_manager"],
    ["team-manager", "team_manager"],
    ["team-leader", "team_leader"],
    ["team-member", "team_member"],
  ])("maps /dashboard/%s to %s", (segment, expectedRole) => {
    expect(getHierarchyRole(segment)).toBe(expectedRole);
  });

  it.each([
    ["global_manager", "/dashboard/global"],
    ["country_manager", "/dashboard/country"],
    ["state_manager", "/dashboard/state"],
    ["divisional_manager", "/dashboard/divisional"],
    ["district_manager", "/dashboard/district"],
    ["team_manager", "/dashboard/team-manager"],
    ["team_leader", "/dashboard/team-leader"],
    ["team_member", "/dashboard/team-member"],
  ] as const)("uses the requested dashboard path for %s", (role, expectedPath) => {
    expect(getHierarchyDashboardPath(role)).toBe(expectedPath);
  });

  it("only exposes the next role in the reporting chain", () => {
    expect(getHierarchyChildRole("global_manager")).toBe("country_manager");
    expect(getHierarchyChildRole("country_manager")).toBe("state_manager");
    expect(getHierarchyChildRole("state_manager")).toBe("divisional_manager");
    expect(getHierarchyChildRole("divisional_manager")).toBe("district_manager");
    expect(getHierarchyChildRole("district_manager")).toBe("team_manager");
    expect(getHierarchyChildRole("team_manager")).toBe("team_leader");
    expect(getHierarchyChildRole("team_leader")).toBe("team_member");
    expect(getHierarchyChildRole("team_member")).toBeNull();
  });
});
