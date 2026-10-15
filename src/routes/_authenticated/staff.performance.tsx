import { createFileRoute } from "@tanstack/react-router";
import { StaffDashboardPage } from "@/components/staff-dashboard";

export const Route = createFileRoute("/_authenticated/staff/performance")({
  component: () => <StaffDashboardPage module="performance" />,
});
