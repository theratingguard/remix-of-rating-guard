import { createFileRoute, redirect } from "@tanstack/react-router";
import { SeoAutomationDashboard } from "@/components/seo-automation-dashboard";

export const Route = createFileRoute("/_authenticated/admin/seo-automation")({
  beforeLoad: ({ context }) => {
    if (!context.isSuperAdmin) throw redirect({ to: "/dashboard", replace: true });
  },
  component: SeoAutomationDashboard,
});
