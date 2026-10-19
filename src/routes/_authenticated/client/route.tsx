import { createFileRoute } from "@tanstack/react-router";
import { ClientLayout } from "@/components/client-layout";

export const Route = createFileRoute("/_authenticated/client")({
  component: ClientRoute,
});

function ClientRoute() {
  const { user } = Route.useRouteContext();
  return <ClientLayout email={user.email ?? "Client account"} userId={user.id} />;
}
