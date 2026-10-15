import { createFileRoute } from "@tanstack/react-router";
import { StaffDashboardPage } from "@/components/staff-dashboard";

export const Route = createFileRoute("/_authenticated/staff/status-board")({
  component: () => <StaffDashboardPage module="status-board" />,
});
