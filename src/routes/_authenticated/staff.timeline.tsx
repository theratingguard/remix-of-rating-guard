import { createFileRoute } from "@tanstack/react-router";
import { StaffOutreachPage } from "@/components/staff-outreach";

export const Route = createFileRoute("/_authenticated/staff/timeline")({
  component: () => <StaffOutreachPage view="timeline" />,
});
