import { createFileRoute } from "@tanstack/react-router";
import { AdminCasesPage } from "@/components/investigator-pages";

export const Route = createFileRoute("/_authenticated/admin/assign")({
  component: AdminCasesPage,
});
