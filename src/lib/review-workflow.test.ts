import { expect, it } from "vitest";
import { reviewWorkflowMetrics } from "./review-workflow";

it("counts tracked reports and removals for the dashboard", () => {
  expect(reviewWorkflowMetrics({ reportedReviews: 5, reportEvents: 3, removed: 1 })).toEqual({
    totalReportsSent: 5,
    totalRemoved: 1,
    successRate: 20,
  });
});

it("returns a zero success rate when no reports have been sent", () => {
  expect(reviewWorkflowMetrics({ reportedReviews: 0, reportEvents: 0, removed: 0 })).toEqual({
    totalReportsSent: 0,
    totalRemoved: 0,
    successRate: 0,
  });
});

it("counts repeated actual reports separately from unique review workflows", () => {
  expect(reviewWorkflowMetrics({ reportedReviews: 2, reportEvents: 4, removed: 1 })).toEqual({
    totalReportsSent: 4,
    totalRemoved: 1,
    successRate: 25,
  });
});
