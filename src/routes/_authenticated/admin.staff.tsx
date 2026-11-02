import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const AdminStaffPage = lazy(() =>
  import("@/components/staff-case-pages").then((module) => ({
    default: module.AdminStaffPage,
  })),
);

export const Route = createFileRoute("/_authenticated/admin/staff")({
  component: StaffApprovalsRoute,
});

function StaffApprovalsRoute() {
  return (
    <Suspense
      fallback={
        <main className="space-y-6 p-4" aria-busy="true" aria-label="Loading staff approvals">
          <div className="surface h-24 animate-pulse rounded-xl" />
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div className="surface h-20 animate-pulse rounded-xl" key={item} />
            ))}
          </div>
          <p className="text-sm text-muted-foreground">Loading staff approvals…</p>
        </main>
      }
    >
      <AdminStaffPage />
    </Suspense>
  );
}
