import { createFileRoute } from "@tanstack/react-router";
import { StaffRegisterPage } from "@/components/staff-case-pages";

export const Route = createFileRoute("/_authenticated/staff/register")({
  component: StaffRegisterRoute,
});

function StaffRegisterRoute() {
  const { user } = Route.useRouteContext();
  return <StaffRegisterPage email={user.email ?? ""} />;
}
