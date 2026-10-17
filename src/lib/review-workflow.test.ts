import { expect, it } from "vitest";
import { reviewWorkflowMetrics } from "./review-workflow";

it("counts only manually confirmed report submissions, not workflow statuses", () => {
  expect(reviewWorkflowMetrics({ reportEvents: 3, removed: 1 })).toEqual({
    totalReportsSent: 3,
    totalRemoved: 1,
    successRate: 33,
  });
});

it("returns a zero success rate when no reports have been sent", () => {
  expect(reviewWorkflowMetrics({ reportEvents: 0, removed: 0 })).toEqual({
    totalReportsSent: 0,
    totalRemoved: 0,
    successRate: 0,
  });
});

it("counts repeated manually confirmed reports separately", () => {
  expect(reviewWorkflowMetrics({ reportEvents: 4, removed: 1 })).toEqual({
    totalReportsSent: 4,
    totalRemoved: 1,
    successRate: 25,
  });
});
