import { createFileRoute } from "@tanstack/react-router";
import { StaffRegisterPage } from "@/components/staff-case-pages";

export const Route = createFileRoute("/staff/register")({
  component: StaffRegisterPage,
});
