import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminRolePermissions } from "@/components/admin-role-permissions";

export const Route = createFileRoute("/_authenticated/admin/role-permissions")({
  beforeLoad: ({ context }) => {
    if (!context.isSuperAdmin) throw redirect({ to: "/dashboard", replace: true });
  },
  component: AdminRolePermissions,
});
