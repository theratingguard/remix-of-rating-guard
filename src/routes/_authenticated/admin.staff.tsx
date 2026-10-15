import { createFileRoute } from "@tanstack/react-router";
import { AdminStaffPage } from "@/components/staff-case-pages";

export const Route = createFileRoute("/_authenticated/admin/staff")({
  component: AdminStaffPage,
});
