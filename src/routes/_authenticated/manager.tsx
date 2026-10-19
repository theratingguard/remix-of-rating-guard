import { createFileRoute } from "@tanstack/react-router";
import { TeamTaskDashboard } from "@/components/team-task-dashboard";

export const Route = createFileRoute("/_authenticated/manager")({
  component: () => <TeamTaskDashboard mode="manager" />,
});
