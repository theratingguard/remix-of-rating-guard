import { createFileRoute } from "@tanstack/react-router";
import { InvestigatorRegisterPage } from "@/components/investigator-pages";

export const Route = createFileRoute("/_authenticated/investigator/register")({
  component: RegisterRoute,
});

function RegisterRoute() {
  const { user } = Route.useRouteContext();
  return <InvestigatorRegisterPage email={user.email ?? ""} />;
}
