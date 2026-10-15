import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: staff, error: staffError } = await supabase
      .from("staff")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle();
    if (staffError) throw new Error(`Could not determine staff navigation: ${staffError.message}`);
    const { data: accessLevel, error: accessError } = await supabase.rpc("report_access_level");
    if (accessError)
      throw new Error(`Could not determine navigation access: ${accessError.message}`);
    const isStaff = Boolean(staff) && accessLevel !== "super_admin";
    const staffPaths = ["/staff/today", "/staff/profile", "/staff/wallet", "/staff/cases"];
    if (isStaff && !staffPaths.includes(location.pathname)) {
      throw redirect({ to: "/staff/today" });
    }
    return { user: data.user, isStaff };
  },
  component: Layout,
});

function Layout() {
  const { user, isStaff } = Route.useRouteContext();
  return (
    <AppShell email={user.email ?? "admin"} isStaff={isStaff}>
      <Outlet />
    </AppShell>
  );
}
