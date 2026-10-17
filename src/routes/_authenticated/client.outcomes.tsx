import { createFileRoute } from "@tanstack/react-router";
import { ClientOutcomesPage } from "@/components/client-outcomes";

export const Route = createFileRoute("/_authenticated/client/outcomes")({
  component: ClientOutcomesPage,
});
