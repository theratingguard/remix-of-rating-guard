import { createFileRoute } from "@tanstack/react-router";
import { AdminStaffDetailPage } from "@/components/staff-case-pages";

export const Route = createFileRoute("/_authenticated/admin/staff/$id")({
  component: StaffDetailRoute,
});

function StaffDetailRoute() {
  const { id } = Route.useParams();
  return <AdminStaffDetailPage id={id} />;
}
