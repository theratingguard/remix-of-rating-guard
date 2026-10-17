export type InactivityCase = {
  id: string;
  business_name: string;
  assigned_at: string;
  updated_at: string;
};

export type CaseActivity = {
  caseId: string;
  createdAt: string;
};

const completedStatuses = new Set(["approved", "rejected", "completed", "closed"]);
const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

export function getInactiveReviews(
  cases: (InactivityCase & { status: string })[],
  activities: CaseActivity[],
  now: number,
) {
  const latestByCase = new Map<string, string>();
  for (const activity of activities) {
    const latest = latestByCase.get(activity.caseId);
    if (!latest || activity.createdAt > latest)
      latestByCase.set(activity.caseId, activity.createdAt);
  }
  return cases.filter((item) => {
    if (completedStatuses.has(item.status)) return false;
    const latest = [item.assigned_at, item.updated_at, latestByCase.get(item.id)]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);
    return latest !== undefined && now - Date.parse(latest) >= sevenDaysMs;
  });
}
