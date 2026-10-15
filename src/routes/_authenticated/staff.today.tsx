import { createFileRoute } from "@tanstack/react-router";
import { StaffTodayPage } from "@/components/staff-case-pages";

export const Route = createFileRoute("/_authenticated/staff/today")({
  component: StaffTodayPage,
});
