import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/client/outcomes")({
  beforeLoad: () => {
    throw redirect({ to: "/submissions", replace: true });
  },
});
