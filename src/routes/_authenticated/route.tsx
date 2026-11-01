import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { ClientLayout } from "@/components/client-layout";
import { StaffApprovalScreen } from "@/components/staff-dashboard";
import { GlobalHeaderControls } from "@/components/global-header-controls";
import { getHierarchyDashboardPath, getHierarchyRole } from "@/lib/management-hierarchy";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error(`Could not verify your session: ${error.message}`);
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .select("id,status,reject_reason,reject_reason_custom,role,manager_id,team_leader_id")
      .eq("id", data.user.id)
      .maybeSingle();
    if (staffError) throw new Error(`Could not determine staff navigation: ${staffError.message}`);
    const accountRole = data.user.app_metadata["role"] ?? data.user.user_metadata?.["role"];
    const accountType = data.user.user_metadata?.["account_type"];
    const expectsStaffProfile =
      accountRole === "staff" ||
      getHierarchyRole(accountRole) !== null ||
      getHierarchyRole(data.user.user_metadata?.["role"]) !== null ||
      data.user.user_metadata?.["is_staff_registration"] === true;
    if (expectsStaffProfile && !staff)
      throw new Error("Staff profile missing. Contact the administrator to restore your account.");
    const { data: accessLevel, error: accessError } = await supabase.rpc("report_access_level");
    if (accessError)
      throw new Error(`Could not determine navigation access: ${accessError.message}`);
    const isStaff = Boolean(staff) && accessLevel !== "super_admin";
    const isSuperAdmin = accessLevel === "super_admin";
    const staffRole = (staff?.role ?? "").toLowerCase().replaceAll("_", " ");
    const hierarchyRole = getHierarchyRole(staff?.role);
    const role = accountRole;
    const isClient = role === "client";
    let isReseller = role === "reseller" || (!role && accountType === "reseller");
    if (!isReseller && !role && !staff && !isClient) {
      const { data: resellerProfile, error: resellerProfileError } = await supabase
        .from("reseller_profiles")
        .select("user_id,status")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (resellerProfileError)
        throw new Error(`Could not determine reseller navigation: ${resellerProfileError.message}`);
      isReseller = Boolean(resellerProfile);
    }
    let isResellerSuspended = false;
    if (isReseller) {
      const { data: resellerProfile, error: resellerProfileError } = await supabase
        .from("reseller_profiles")
        .select("status")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (resellerProfileError)
        throw new Error(
          `Could not determine reseller account status: ${resellerProfileError.message}`,
        );
      isResellerSuspended = resellerProfile?.status === "suspended";
    }
    if (location.pathname === "/dashboard") {
      if (isSuperAdmin) throw redirect({ to: "/admin/staff", replace: true });
      if (hierarchyRole)
        throw redirect({ href: getHierarchyDashboardPath(hierarchyRole), replace: true });
      if (isStaff) throw redirect({ to: "/staff/today", replace: true });
      if (isClient) throw redirect({ to: "/client/dashboard", replace: true });
      if (isReseller) throw redirect({ to: "/reseller", replace: true });
    }
    if (
      hierarchyRole &&
      location.pathname.startsWith("/dashboard/") &&
      location.pathname !== getHierarchyDashboardPath(hierarchyRole)
    ) {
      throw redirect({ href: getHierarchyDashboardPath(hierarchyRole), replace: true });
    }
    const clientPaths = [
      "/client/dashboard",
      "/client/scan",
      "/client/reports",
      "/client/settings",
      "/profile",
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
    const resellerPaths = ["/reseller", "/profile", "/chat"];
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
      "/profile",
      "/staff/cases",
      "/chat",
    ];
    const hierarchyDashboardPath = hierarchyRole ? getHierarchyDashboardPath(hierarchyRole) : null;
    const hierarchyPaths = [
      hierarchyDashboardPath,
      "/profile",
      "/staff/wallet",
      "/staff/tasks",
      ...(hierarchyRole === "team_member" ? ["/staff/evidence"] : []),
    ];
    const hierarchyPathAllowed = !hierarchyRole || hierarchyPaths.includes(location.pathname);
    if (isStaff && hierarchyRole && !hierarchyPathAllowed) {
      throw redirect({ href: hierarchyDashboardPath!, replace: true });
    }
    if (
      isStaff &&
      !staffPaths.includes(location.pathname) &&
      location.pathname !== hierarchyDashboardPath
    ) {
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
      isResellerSuspended,
      pendingStaffCount,
      staffRole: staff?.role ?? null,
      staffStatus: staff?.status ?? null,
      rejectReason: staff?.reject_reason_custom ?? staff?.reject_reason ?? null,
      staffNotice,
    };
  },
  component: Layout,
});

function SuspendedResellerScreen() {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function signOut() {
    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSigningOut(false);
      setSignOutError(`Could not end the suspended reseller session: ${error.message}`);
      return;
    }
    await navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="w-full max-w-lg space-y-4 rounded-2xl border bg-card p-6 text-center shadow-sm">
        <h1 className="font-display text-2xl font-bold">Reseller access suspended</h1>
        <p className="text-sm text-muted-foreground">
          This reseller account is suspended. Contact the Super Admin if you believe this is a
          mistake.
        </p>
        {signOutError && (
          <p role="alert" className="text-sm text-destructive">
            {signOutError}
          </p>
        )}
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          disabled={signingOut}
          onClick={() => void signOut()}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </section>
    </main>
  );
}

function Layout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const {
    user,
    isStaff,
    isSuperAdmin,
    isClient,
    isReseller,
    isResellerSuspended,
    staffRole,
    pendingStaffCount,
    staffStatus,
    rejectReason,
    staffNotice,
  } = Route.useRouteContext();
  if (isResellerSuspended) return <SuspendedResellerScreen />;
  if (isStaff && staffStatus !== "active" && staffStatus !== "approved") {
    if (pathname === "/profile") {
      return (
        <div>
          <header className="flex h-14 items-center justify-between border-b bg-card/80 px-4 sm:px-6">
            <Link to="/profile" className="flex items-center gap-2 font-semibold">
              <img src="/logo.svg" alt="" width={32} height={32} />
              Rating Guard
            </Link>
            <GlobalHeaderControls userId={user.id} isSuperAdmin={false} isClient={false} />
          </header>
          <main className="mx-auto max-w-[1720px] px-4 py-5 sm:px-6">
            <Outlet />
          </main>
        </div>
      );
    }

    return (
      <div>
        <header className="flex h-14 items-center justify-between border-b bg-card/80 px-4 sm:px-6">
          <Link to="/profile" className="flex items-center gap-2 font-semibold">
            <img src="/logo.svg" alt="" width={32} height={32} />
            Rating Guard
          </Link>
          <GlobalHeaderControls userId={user.id} isSuperAdmin={false} isClient={false} />
        </header>
        <StaffApprovalScreen
          status={staffStatus ?? "pending"}
          rejectReason={rejectReason}
          notice={staffNotice}
        />
      </div>
    );
  }

  if (isClient) {
    return pathname === "/profile" ? (
      <ClientLayout email={user.email ?? "Client account"} userId={user.id}>
        <Outlet />
      </ClientLayout>
    ) : (
      <Outlet />
    );
  }
  if (isReseller) {
    return (
      <AppShell
        email={user.email ?? "Reseller"}
        userId={user.id}
        isStaff={false}
        isSuperAdmin={false}
        isClient={false}
        isReseller
        staffRole={null}
        staffPendingCount={0}
      >
        <Outlet />
      </AppShell>
    );
  }
  return (
    <AppShell
      email={user.email ?? "admin"}
      userId={user.id}
      isStaff={isStaff}
      isSuperAdmin={isSuperAdmin}
      isClient={isClient}
      isReseller={isReseller}
      staffRole={staffRole}
      staffPendingCount={pendingStaffCount}
    >
      <Outlet />
    </AppShell>
  );
}
