import { createFileRoute } from "@tanstack/react-router";
import { InvestigatorProfilePage } from "@/components/investigator-pages";

export const Route = createFileRoute("/_authenticated/investigator/profile")({
  component: InvestigatorProfilePage,
});
