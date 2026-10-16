type PerformanceCase = {
  status: string;
  assigned_at: string;
  closed_at: string | null;
  updated_at: string;
  first_attempt_approved: boolean | null;
};

const terminalStatuses = new Set(["approved", "completed", "closed"]);

export function getStaffPerformanceMetrics(
  cases: PerformanceCase[],
  monthlyTarget: number,
  now = new Date(),
) {
  const completed = cases.filter((task) => terminalStatuses.has(task.status)).length;
  const pending = cases.filter((task) =>
    ["open", "accepted", "in_progress", "rework"].includes(task.status),
  ).length;
  const firstAttemptDecisions = cases.filter((task) => task.first_attempt_approved !== null);
  const firstAttemptApprovals = firstAttemptDecisions.filter(
    (task) => task.first_attempt_approved === true,
  ).length;
  const turnarounds = cases.flatMap((task) => {
    if (!task.closed_at) return [];
    const start = Date.parse(task.assigned_at);
    const end = Date.parse(task.closed_at);
    return Number.isFinite(start) && Number.isFinite(end) && end >= start
      ? [(end - start) / 3_600_000]
      : [];
  });
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const achievedThisMonth = cases.filter((task) => {
    if (!terminalStatuses.has(task.status)) return false;
    const completedAt = Date.parse(task.closed_at ?? task.updated_at);
    return Number.isFinite(completedAt) && completedAt >= monthStart && completedAt < nextMonth;
  }).length;

  return {
    completed,
    pending,
    reworkRejected: cases.filter((task) => ["rework", "rejected"].includes(task.status)).length,
    firstAttemptApprovals,
    firstAttemptDecisions: firstAttemptDecisions.length,
    firstAttemptRate: firstAttemptDecisions.length
      ? Math.round((firstAttemptApprovals / firstAttemptDecisions.length) * 100)
      : null,
    averageTatHours: turnarounds.length
      ? turnarounds.reduce((sum, hours) => sum + hours, 0) / turnarounds.length
      : null,
    monthlyTarget: Math.max(0, monthlyTarget),
    achievedThisMonth,
  };
}

type CreditEntry = { amount: number; created_at: string };
type WalletEntry = {
  transaction_type: "quality_bonus" | "penalty";
  amount: number;
  created_at: string;
};

export function getStaffWalletSummary(
  credits: CreditEntry[],
  ledger: WalletEntry[],
  cases: {
    status: string;
    ai_status: string | null;
    closed_at: string | null;
    updated_at: string;
  }[],
  now = new Date(),
) {
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const inCurrentMonth = (date: string) => {
    const timestamp = Date.parse(date);
    return Number.isFinite(timestamp) && timestamp >= monthStart && timestamp < nextMonth;
  };
  const monthlyApprovedTaskCount = cases.filter((task) => {
    if (
      !["approved", "completed"].includes(task.status) &&
      !(task.status === "closed" && task.ai_status === "removed")
    )
      return false;
    return inCurrentMonth(task.closed_at ?? task.updated_at);
  }).length;
  const monthlyCreditsValue = credits
    .filter((entry) => inCurrentMonth(entry.created_at))
    .reduce((sum, entry) => sum + entry.amount * 10, 0);
  const monthlyBonus = ledger
    .filter(
      (entry) => entry.transaction_type === "quality_bonus" && inCurrentMonth(entry.created_at),
    )
    .reduce((sum, entry) => sum + entry.amount, 0);
  const monthlyPenalty = ledger
    .filter((entry) => entry.transaction_type === "penalty" && inCurrentMonth(entry.created_at))
    .reduce((sum, entry) => sum + entry.amount, 0);

  return {
    approvedTaskCount: monthlyApprovedTaskCount,
    qualityBonus: monthlyBonus,
    penalty: monthlyPenalty,
    monthlyPayout: monthlyCreditsValue + monthlyBonus - monthlyPenalty,
    totalEarned:
      credits.reduce((sum, entry) => sum + entry.amount * 10, 0) +
      ledger.reduce(
        (sum, entry) => sum + entry.amount * (entry.transaction_type === "penalty" ? -1 : 1),
        0,
      ),
  };
}
