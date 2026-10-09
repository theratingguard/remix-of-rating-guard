import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { profileQuery } from "@/lib/profile";
import { APP_DOMAIN } from "@/lib/config";
import { useState, type ReactNode } from "react";
import { LayoutDashboard, ScanSearch, History, FileText, Settings, LogOut, Menu, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import shield from "@/assets/icon-shield.png";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/scan", label: "New Scan", Icon: ScanSearch },
  { to: "/history", label: "Scan History", Icon: History },
  { to: "/reports", label: "Reports", Icon: FileText },
  { to: "/settings", label: "Settings", Icon: Settings },
] as const;

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <img src={shield} alt="" width={40} height={40} className="icon-3d size-10" />
      <div className="leading-tight">
        <div className="font-display text-sm font-bold tracking-tight">The Rating <span className="text-gradient">Guard</span></div>
        <div className="text-[11px] text-muted-foreground">Super Admin Console</div>
      </div>
    </div>
  );
}

function SidebarBody({ email, onNavigate }: { email: string; onNavigate?: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: profile } = useQuery(profileQuery());
  async function logout() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Brand />
      <nav className="flex flex-col gap-1">
        {nav.map(({ to, label, Icon }) => (
          <Link key={to} to={to} onClick={onNavigate}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            activeProps={{ className: "bg-sidebar-accent !text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--primary)]" }}>
            <Icon className="h-4 w-4" /> {label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto space-y-1 border-t pt-4">
        <Link to="/profile" onClick={onNavigate} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-sidebar-accent" activeProps={{ className: "bg-sidebar-accent" }}>
          <Avatar name={profile?.name ?? "Admin"} url={profile?.avatarUrl ?? null} size={28} />
          <span className="min-w-0"><span className="block truncate text-sm font-medium">{profile?.name ?? "Admin"}</span><span className="block truncate text-[11px] text-muted-foreground">{email}</span></span>
        </Link>
        <div className="flex items-center justify-between gap-2">
          <button onClick={logout} className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
        <div className="px-3 pt-2 text-[10px] text-muted-foreground">{APP_DOMAIN}</div>
      </div>
    </div>
  );
}

export function AppShell({ email, children }: { email: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <aside className="no-print fixed inset-y-0 left-0 hidden w-60 border-r bg-sidebar backdrop-blur-xl lg:block">
        <SidebarBody email={email} />
      </aside>
      <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b bg-card/80 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          <Button size="sm" asChild><Link to="/scan">Scan</Link></Button>
          <Button size="icon" variant="ghost" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></Button>
        </div>
      </header>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0"><SidebarBody email={email} onNavigate={() => setOpen(false)} /></SheetContent>
      </Sheet>
      <main className="lg:pl-60">
        <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="surface flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand"><ScanSearch /></div>
      <div className="font-semibold">{title}</div>
      {action}
    </div>
  );
}

export function StatusPill({ status, error }: { status: string; error?: string | null }) {
  const m: Record<string, [string, string]> = {
    complete: ["Complete", "bg-risk-normal-soft text-risk-normal"],
    failed: ["Failed", "bg-risk-high-soft text-risk-high"],
    running: ["Running", "bg-brand-soft text-brand"],
    pending: ["Pending", "bg-muted text-muted-foreground"],
  };
  const [label, cls] = m[status] ?? [status, "bg-muted text-muted-foreground"];
  return <span title={error ?? undefined} className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

export function Avatar({ name, url, size = 32 }: { name: string; url: string | null; size?: number }) {
  return url ? (
    <img src={url} alt={`${name} profile photo`} width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <div aria-hidden className="grid shrink-0 place-items-center rounded-full bg-primary font-bold text-primary-foreground" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {(name || "A").slice(0, 1).toUpperCase()}
    </div>
  );
}
