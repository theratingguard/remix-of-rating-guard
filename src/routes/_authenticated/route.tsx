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
      .select("id,status,reject_reason,reject_reason_custom")
      .eq("id", data.user.id)
      .maybeSingle();
    if (staffError) throw new Error(`Could not determine staff navigation: ${staffError.message}`);
    const { data: accessLevel, error: accessError } = await supabase.rpc("report_access_level");
    if (accessError)
      throw new Error(`Could not determine navigation access: ${accessError.message}`);
    const isStaff = Boolean(staff) && accessLevel !== "super_admin";
    const isSuperAdmin = accessLevel === "super_admin";
    const role = data.user.app_metadata["role"];
    const isClient = role === "client";
    const isReseller = role === "reseller";
    if (location.pathname === "/dashboard") {
      if (isSuperAdmin) throw redirect({ to: "/admin/staff", replace: true });
      if (isStaff) throw redirect({ to: "/staff/today", replace: true });
      if (isClient) throw redirect({ to: "/client/dashboard", replace: true });
      if (isReseller) throw redirect({ to: "/reseller", replace: true });
    }
    const clientPaths = [
      "/client/dashboard",
      "/client/scan",
      "/client/reports",
      "/client/settings",
      "/chat",
    ];
    if (isClient && !clientPaths.includes(location.pathname))
      throw redirect({ to: "/client/dashboard", replace: true });
    if (
      !isClient &&
      (location.pathname === "/client" || location.pathname.startsWith("/client/"))
    ) {
      if (isSuperAdmin) throw redirect({ to: "/admin/staff", replace: true });
      if (isStaff) throw redirect({ to: "/staff/today", replace: true });
      throw redirect({ to: "/dashboard", replace: true });
    }
    const resellerPaths = ["/reseller", "/chat"];
    if (isReseller && !resellerPaths.includes(location.pathname))
      throw redirect({ to: "/reseller", replace: true });
    if (
      !isReseller &&
      (location.pathname === "/reseller" || location.pathname.startsWith("/reseller/"))
    ) {
      if (isSuperAdmin) throw redirect({ to: "/admin/staff", replace: true });
      if (isStaff) throw redirect({ to: "/staff/today", replace: true });
      if (isClient) throw redirect({ to: "/client/dashboard", replace: true });
      throw redirect({ to: "/dashboard", replace: true });
    }
    if (location.pathname === "/chat" && !isClient && !isReseller && !isStaff && !isSuperAdmin) {
      throw redirect({ to: "/dashboard", replace: true });
    }
    let pendingStaffCount = 0;
    if (isSuperAdmin) {
      const { count, error: pendingError } = await supabase
        .from("staff")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (pendingError)
        throw new Error(`Could not load pending staff count: ${pendingError.message}`);
      pendingStaffCount = count ?? 0;
    }
    let staffNotice: string | null = null;
    if (staff && !["approved", "active"].includes(staff.status)) {
      const { data: latestMessage, error: messageError } = await supabase
        .from("staff_admin_messages")
        .select("message")
        .eq("staff_id", staff.id)
        .eq("sender_role", "admin")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (messageError)
        throw new Error(`Could not load your staff application notice: ${messageError.message}`);
      staffNotice = latestMessage?.message ?? null;
    }
    const staffPaths = [
      "/staff/today",
      "/staff/tasks",
      "/staff/status-board",
      "/staff/performance",
      "/staff/quality",
      "/staff/wallet",
      "/staff/communication",
      "/staff/activity",
      "/staff/evidence",
      "/staff/timeline",
      "/staff/lead-activity",
      "/staff/alerts",
      "/staff/profile",
      "/staff/cases",
      "/chat",
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
    return {
      user: data.user,
      isStaff,
      isSuperAdmin,
      isClient,
      isReseller,
      pendingStaffCount,
      staffStatus: staff?.status ?? null,
      rejectReason: staff?.reject_reason_custom ?? staff?.reject_reason ?? null,
      staffNotice,
    };
  },
  component: Layout,
});

function Layout() {
  const {
    user,
    isStaff,
    isSuperAdmin,
    isClient,
    isReseller,
    pendingStaffCount,
    staffStatus,
    rejectReason,
    staffNotice,
  } = Route.useRouteContext();
  if (isStaff && staffStatus !== "active" && staffStatus !== "approved") {
    return (
      <StaffApprovalScreen
        status={staffStatus ?? "pending"}
        rejectReason={rejectReason}
        notice={staffNotice}
      />
    );
  }
  if (isClient || isReseller) return <Outlet />;
  return (
    <AppShell
      email={user.email ?? "admin"}
      userId={user.id}
      isStaff={isStaff}
      isSuperAdmin={isSuperAdmin}
      isClient={isClient}
      staffPendingCount={pendingStaffCount}
    >
      <Outlet />
    </AppShell>
  );
}
