import { createFileRoute } from "@tanstack/react-router";
import { TeamTaskDashboard } from "@/components/team-task-dashboard";
import { ManagerCaseAssignmentPage } from "@/components/staff-case-pages";

export const Route = createFileRoute("/_authenticated/manager")({
  component: ManagerPage,
});

function ManagerPage() {
  return (
    <>
      <TeamTaskDashboard mode="manager" />
      <ManagerCaseAssignmentPage />
    </>
  );
}
