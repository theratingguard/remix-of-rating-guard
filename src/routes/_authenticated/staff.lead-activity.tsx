import { createFileRoute } from "@tanstack/react-router";
import { StaffActivityReviewPage } from "@/components/staff-activity-review";

export const Route = createFileRoute("/_authenticated/staff/lead-activity")({
  component: StaffActivityReviewPage,
});
