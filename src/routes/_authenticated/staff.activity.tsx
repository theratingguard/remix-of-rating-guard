import { createFileRoute } from "@tanstack/react-router";
import { StaffOutreachPage } from "@/components/staff-outreach";

export const Route = createFileRoute("/_authenticated/staff/activity")({
  component: () => <StaffOutreachPage view="activity" />,
});
