import { createFileRoute, redirect } from "@tanstack/react-router";
import { TeamTaskDashboard } from "@/components/team-task-dashboard";

export const Route = createFileRoute("/_authenticated/admin/task-manager")({
  beforeLoad: ({ context }) => {
    if (!context.isSuperAdmin) throw redirect({ to: "/dashboard", replace: true });
  },
  component: () => <TeamTaskDashboard mode="task-manager" />,
});
