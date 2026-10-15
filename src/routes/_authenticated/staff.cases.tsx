import { createFileRoute } from "@tanstack/react-router";
import { StaffCasesPage } from "@/components/staff-case-pages";

export const Route = createFileRoute("/_authenticated/staff/cases")({
  component: StaffCasesPage,
});
