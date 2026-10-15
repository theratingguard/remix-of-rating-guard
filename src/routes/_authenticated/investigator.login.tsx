import { createFileRoute } from "@tanstack/react-router";
import { InvestigatorLoginRedirect } from "@/components/investigator-pages";

export const Route = createFileRoute("/_authenticated/investigator/login")({
  component: InvestigatorLoginRedirect,
});
