import { createFileRoute } from "@tanstack/react-router";
import { StaffLoginPage } from "@/components/staff-case-pages";

export const Route = createFileRoute("/staff/login")({
  component: StaffLoginPage,
});
