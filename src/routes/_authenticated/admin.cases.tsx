import { createFileRoute } from "@tanstack/react-router";
import { AdminCasesPage as InvestigatorAdminCasesPage } from "@/components/investigator-pages";
import { AdminCasesPage as StaffAdminCasesPage } from "@/components/staff-case-pages";

export const Route = createFileRoute("/_authenticated/admin/cases")({
  component: CombinedAdminCasesPage,
});

function CombinedAdminCasesPage() {
  return (
    <div className="space-y-10">
      <StaffAdminCasesPage />
      <InvestigatorAdminCasesPage />
    </div>
  );
}
