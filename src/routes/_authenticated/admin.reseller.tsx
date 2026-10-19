import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminResellersPage } from "./admin.resellers";

export const Route = createFileRoute("/_authenticated/admin/reseller")({
  beforeLoad: ({ context }) => {
    if (!context.isSuperAdmin) throw redirect({ to: "/dashboard", replace: true });
  },
  component: AdminResellersPage,
});
