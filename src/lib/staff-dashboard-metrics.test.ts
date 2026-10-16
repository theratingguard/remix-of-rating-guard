import { describe, expect, it } from "vitest";
import { getStaffPerformanceMetrics, getStaffWalletSummary } from "./staff-dashboard-metrics";

describe("staff dashboard performance metrics", () => {
  it("counts only explicitly tracked first-attempt decisions and computes assigned-to-closed TAT", () => {
    const metrics = getStaffPerformanceMetrics(
      [
        {
          status: "closed",
          assigned_at: "2026-10-01T00:00:00.000Z",
          closed_at: "2026-10-01T12:00:00.000Z",
          updated_at: "2026-10-01T12:00:00.000Z",
          first_attempt_approved: true,
        },
        {
          status: "closed",
          assigned_at: "2026-10-01T00:00:00.000Z",
          closed_at: "2026-10-03T00:00:00.000Z",
          updated_at: "2026-10-03T00:00:00.000Z",
          first_attempt_approved: false,
        },
        {
          status: "approved",
          assigned_at: "2026-10-01T00:00:00.000Z",
          closed_at: null,
          updated_at: "2026-10-02T00:00:00.000Z",
          first_attempt_approved: null,
        },
      ],
      20,
      new Date("2026-10-16T00:00:00.000Z"),
    );
    expect(metrics.firstAttemptApprovals).toBe(1);
    expect(metrics.firstAttemptDecisions).toBe(2);
    expect(metrics.firstAttemptRate).toBe(50);
    expect(metrics.averageTatHours).toBe(30);
    expect(metrics.monthlyTarget).toBe(20);
    expect(metrics.achievedThisMonth).toBe(3);
  });
});

describe("staff wallet summary", () => {
  it("summarizes this month's approved tasks, credit value, bonuses, and penalties", () => {
    const summary = getStaffWalletSummary(
      [
        { amount: 2, created_at: "2026-10-05T00:00:00.000Z" },
        { amount: 3, created_at: "2026-09-30T23:59:59.000Z" },
      ],
      [
        {
          transaction_type: "quality_bonus",
          amount: 150,
          created_at: "2026-10-08T00:00:00.000Z",
        },
        { transaction_type: "penalty", amount: 25, created_at: "2026-10-09T00:00:00.000Z" },
      ],
      [
        {
          status: "approved",
          ai_status: null,
          closed_at: "2026-10-06T00:00:00.000Z",
          updated_at: "2026-10-06T00:00:00.000Z",
        },
      ],
      new Date("2026-10-16T00:00:00.000Z"),
    );
    expect(summary).toEqual({
      approvedTaskCount: 1,
      qualityBonus: 150,
      penalty: 25,
      monthlyPayout: 145,
      totalEarned: 175,
    });
  });
});
