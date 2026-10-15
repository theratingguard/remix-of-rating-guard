import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/staff/cases")({
  beforeLoad: () => {
    throw redirect({ to: "/staff/today" });
  },
});
