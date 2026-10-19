import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminTeamManagement } from "@/components/admin-team-management";

export const Route = createFileRoute("/_authenticated/admin/team-management")({
  beforeLoad: ({ context }) => {
    if (!context.isSuperAdmin) throw redirect({ to: "/dashboard", replace: true });
  },
  component: AdminTeamManagement,
});
