export const REVIEW_WORKFLOW_STATUSES = [
  "REPORTED",
  "REPLIED",
  "RESCANNING",
  "INVESTIGATING",
  "REPORTED_AGAIN",
  "REMOVED",
] as const;

export type ReviewWorkflowStatus = (typeof REVIEW_WORKFLOW_STATUSES)[number];

export const REVIEW_WORKFLOW_LABELS: Record<ReviewWorkflowStatus, string> = {
  REPORTED: "Reported",
  REPLIED: "Replied",
  RESCANNING: "Rescanning",
  INVESTIGATING: "Investigating",
  REPORTED_AGAIN: "Reported Again",
  REMOVED: "Removed",
};

export function reviewWorkflowMetrics(counts: {
  reportedReviews: number;
  reportEvents: number;
  removed: number;
}) {
  const totalReportsSent = Math.max(counts.reportedReviews, counts.reportEvents);
  const totalRemoved = counts.removed;
  return {
    totalReportsSent,
    totalRemoved,
    successRate: totalReportsSent ? Math.round((totalRemoved / totalReportsSent) * 100) : 0,
  };
}
