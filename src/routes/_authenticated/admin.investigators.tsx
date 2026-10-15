import { createFileRoute } from "@tanstack/react-router";
import { AdminInvestigatorsPage } from "@/components/investigator-pages";

export const Route = createFileRoute("/_authenticated/admin/investigators")({
  component: AdminInvestigatorsPage,
});
