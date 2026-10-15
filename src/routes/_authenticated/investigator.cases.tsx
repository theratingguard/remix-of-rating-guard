import { createFileRoute } from "@tanstack/react-router";
import { InvestigatorCasesPage } from "@/components/investigator-pages";

export const Route = createFileRoute("/_authenticated/investigator/cases")({
  component: InvestigatorCasesPage,
});
