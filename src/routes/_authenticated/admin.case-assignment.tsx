import { createFileRoute } from "@tanstack/react-router";
import { AdminCaseAssignmentPage } from "@/components/staff-case-pages";

export const Route = createFileRoute("/_authenticated/admin/case-assignment")({
  component: AdminCaseAssignmentPage,
});
