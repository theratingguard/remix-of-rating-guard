export const HIERARCHY_ROLES = [
  "global_manager",
  "country_manager",
  "state_manager",
  "divisional_manager",
  "district_manager",
  "team_manager",
  "team_leader",
  "team_member",
] as const;

export type HierarchyRole = (typeof HIERARCHY_ROLES)[number];

export const HIERARCHY_ROLE_LABELS: Record<HierarchyRole, string> = {
  global_manager: "Global Manager",
  country_manager: "Country Manager",
  state_manager: "State Manager",
  divisional_manager: "Divisional Manager",
  district_manager: "District Manager",
  team_manager: "Team Manager",
  team_leader: "Team Leader",
  team_member: "Team Member",
};

const DASHBOARD_SEGMENTS: Record<HierarchyRole, string> = {
  global_manager: "global",
  country_manager: "country",
  state_manager: "state",
  divisional_manager: "divisional",
  district_manager: "district",
  team_manager: "team-manager",
  team_leader: "team-leader",
  team_member: "team-member",
};

const DASHBOARD_ROLE_ALIASES: Record<string, HierarchyRole> = {
  global: "global_manager",
  country: "country_manager",
  state: "state_manager",
  division: "divisional_manager",
  divisional: "divisional_manager",
  district: "district_manager",
};

export function getHierarchyRole(value: string | null | undefined): HierarchyRole | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replaceAll(" ", "_").replaceAll("-", "_");
  if (!normalized) return null;
  if (DASHBOARD_ROLE_ALIASES[normalized]) return DASHBOARD_ROLE_ALIASES[normalized];
  if (normalized === "manager") return "team_manager";
  if (normalized === "team_lead" || normalized === "tl") return "team_leader";
  if (normalized === "staff") return "team_member";
  return HIERARCHY_ROLES.find((role) => role === normalized) ?? null;
}

export function getHierarchyDashboardPath(role: HierarchyRole): string {
  return `/dashboard/${DASHBOARD_SEGMENTS[role]}`;
}

export function getHierarchyChildRole(role: HierarchyRole): HierarchyRole | null {
  const childRoles: Partial<Record<HierarchyRole, HierarchyRole>> = {
    global_manager: "country_manager",
    country_manager: "state_manager",
    state_manager: "divisional_manager",
    divisional_manager: "district_manager",
    district_manager: "team_manager",
    team_manager: "team_leader",
    team_leader: "team_member",
  };
  return childRoles[role] ?? null;
}
