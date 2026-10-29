import { createFileRoute } from "@tanstack/react-router";
import { HierarchyDashboard } from "@/components/hierarchy-dashboard";

export const Route = createFileRoute("/_authenticated/dashboard/$role")({
  component: DashboardRoute,
});

function DashboardRoute() {
  const { role } = Route.useParams();
  return <HierarchyDashboard routeRole={role} />;
}
