import type { RuleCheck, RuleCheckStatus, RuleGroup } from "./types";

export function makeCheck(
  id: string,
  group: RuleGroup,
  status: RuleCheckStatus,
  points = 0,
  evidence: string | null = null,
): RuleCheck {
  return { id, group, status, points: status === "flagged" ? points : 0, evidence };
}

export function completeChecks(
  group: RuleGroup,
  catalog: readonly string[],
  evaluated: Map<string, RuleCheck>,
): RuleCheck[] {
  return catalog.map((id) => evaluated.get(id) ?? makeCheck(id, group, "not_assessed", 0, null));
}

export function observed(
  id: string,
  group: RuleGroup,
  matches: boolean | null,
  points: number,
  evidence: string,
): RuleCheck {
  if (matches === null) return makeCheck(id, group, "not_assessed");
  return matches
    ? makeCheck(id, group, "flagged", points, evidence)
    : makeCheck(id, group, "clear");
}

export function contextual(
  id: string,
  group: RuleGroup,
  present: boolean | null,
  evidence: string,
): RuleCheck {
  if (present === null) return makeCheck(id, group, "not_assessed");
  return present ? makeCheck(id, group, "context", 0, evidence) : makeCheck(id, group, "clear");
}
