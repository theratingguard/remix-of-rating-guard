import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { StaffApprovalScreen } from "@/components/staff-dashboard";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .select("id,status")
      .eq("id", data.user.id)
      .maybeSingle();
    if (staffError) throw new Error(`Could not determine staff navigation: ${staffError.message}`);
    const { data: accessLevel, error: accessError } = await supabase.rpc("report_access_level");
    if (accessError)
      throw new Error(`Could not determine navigation access: ${accessError.message}`);
    const isStaff = Boolean(staff) && accessLevel !== "super_admin";
    const staffPaths = [
      "/staff/today",
      "/staff/tasks",
      "/staff/status-board",
      "/staff/performance",
      "/staff/quality",
      "/staff/wallet",
      "/staff/communication",
      "/staff/alerts",
      "/staff/profile",
      "/staff/cases",
      "/staff/register",
    ];
    if (isStaff && !staffPaths.includes(location.pathname)) {
      throw redirect({ to: "/staff/today" });
    }
    if (
      !isStaff &&
      location.pathname.startsWith("/staff/") &&
      location.pathname !== "/staff/register"
    ) {
      throw redirect({ to: "/staff/register" });
    }
    return { user: data.user, isStaff, staffStatus: staff?.status ?? null };
  },
  component: Layout,
});

function Layout() {
  const { user, isStaff, staffStatus } = Route.useRouteContext();
  if (isStaff && staffStatus !== "active" && staffStatus !== "approved") {
    return <StaffApprovalScreen status={staffStatus ?? "pending"} />;
  }
  return (
    <AppShell email={user.email ?? "admin"} isStaff={isStaff}>
      <Outlet />
    </AppShell>
  );
}
