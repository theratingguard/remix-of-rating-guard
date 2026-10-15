import { createFileRoute } from "@tanstack/react-router";
import { StaffDashboardPage } from "@/components/staff-dashboard";

export const Route = createFileRoute("/_authenticated/staff/quality")({
  component: () => <StaffDashboardPage module="quality" />,
});
