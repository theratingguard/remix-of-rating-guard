import { createFileRoute } from "@tanstack/react-router";
import { StaffDashboardPage } from "@/components/staff-dashboard";

export const Route = createFileRoute("/_authenticated/staff/alerts")({
  component: () => <StaffDashboardPage module="alerts" />,
});
