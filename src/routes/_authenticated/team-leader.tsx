import { createFileRoute } from "@tanstack/react-router";
import { TeamTaskDashboard } from "@/components/team-task-dashboard";

export const Route = createFileRoute("/_authenticated/team-leader")({
  component: () => <TeamTaskDashboard mode="leader" />,
});
