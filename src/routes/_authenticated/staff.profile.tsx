import { createFileRoute } from "@tanstack/react-router";
import { StaffProfilePage } from "@/components/staff-case-pages";

export const Route = createFileRoute("/_authenticated/staff/profile")({
  component: StaffProfilePage,
});
