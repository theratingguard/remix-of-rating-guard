import { createFileRoute } from "@tanstack/react-router";
import { AdminInvestigatorDetailPage } from "@/components/investigator-pages";

export const Route = createFileRoute("/_authenticated/admin/investigators/$id")({
  component: InvestigatorDetailRoute,
});

function InvestigatorDetailRoute() {
  const { id } = Route.useParams();
  return <AdminInvestigatorDetailPage id={id} />;
}
