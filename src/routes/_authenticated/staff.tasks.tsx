import { createFileRoute } from "@tanstack/react-router";
import { TeamTaskDashboard } from "@/components/team-task-dashboard";
import { StaffDashboardPage } from "@/components/staff-dashboard";

export const Route = createFileRoute("/_authenticated/staff/tasks")({
  component: () => (
    <div className="space-y-8">
      <TeamTaskDashboard mode="staff" />
      <StaffDashboardPage module="tasks" />
    </div>
  ),
});
