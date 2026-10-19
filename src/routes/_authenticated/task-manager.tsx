import { createFileRoute } from "@tanstack/react-router";
import { TeamTaskDashboard } from "@/components/team-task-dashboard";

export const Route = createFileRoute("/_authenticated/task-manager")({
  component: () => <TeamTaskDashboard mode="task-manager" />,
});
