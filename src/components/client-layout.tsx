import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, LayoutDashboard, LogOut, ScanLine, Settings2, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const clientNavigation = [
  { to: "/client/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/client/scan", label: "Scan & Remove", Icon: ScanLine },
  { to: "/client/reports", label: "Reports", Icon: FileText },
  { to: "/client/settings", label: "Settings / Profile", Icon: Settings2 },
] as const;

export function ClientLayout({ email }: { email: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Could not sign out. Please try again.");
      return;
    }
    queryClient.clear();
    await navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-card px-4 py-6 lg:flex lg:flex-col">
        <Link to="/client/dashboard" className="mb-9 flex items-center gap-3 px-2">
          <img src="/logo.svg" alt="" className="size-10" />
          <span className="font-display text-lg font-bold">Rating Guard</span>
        </Link>
        <nav aria-label="Client navigation" className="space-y-1">
          {clientNavigation.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: true }}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              activeProps={{ className: "bg-primary/10 !text-primary" }}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-xl bg-muted/60 p-4 text-xs leading-relaxed text-muted-foreground">
          Review assessments are informational. Google makes all moderation decisions.
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-6">
          <Link to="/client/dashboard" className="flex items-center gap-2 lg:hidden">
            <img src="/logo.svg" alt="" className="size-8" />
            <span className="font-display font-bold">Rating Guard</span>
          </Link>
          <div className="hidden text-sm text-muted-foreground lg:block">Client workspace</div>
          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-4">
            <Link
              to="/client/reports"
              aria-label="Notifications and reports"
              className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Bell className="size-5" />
            </Link>
            <Link
              to="/client/settings"
              className="hidden max-w-56 truncate text-sm text-muted-foreground hover:text-foreground sm:block"
            >
              {email}
            </Link>
            <Button variant="outline" size="sm" onClick={() => void logout()} aria-label="Log out">
              <LogOut className="mr-2 size-4" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 pb-24 sm:px-6 sm:py-8 lg:px-8 lg:pb-10">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="Mobile client navigation"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur lg:hidden"
      >
        {clientNavigation.map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: true }}
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium text-muted-foreground"
            activeProps={{ className: "!text-primary" }}
          >
            <Icon className="size-5" />
            <span className="max-w-full truncate px-1">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
