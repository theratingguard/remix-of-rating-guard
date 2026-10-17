import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { profileQuery } from "@/lib/profile";
import { APP_DOMAIN } from "@/lib/config";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  ScanSearch,
  History,
  FileText,
  Settings,
  LogOut,
  Menu,
  Star,
  Globe2,
  CircleHelp,
  Users,
  ListChecks,
  HardDrive,
  CircleDollarSign,
  ClipboardList,
  UserRound,
  Activity,
  FolderLock,
  GitCommitHorizontal,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const adminNav = [
  { to: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/scan", label: "URL Scanner", Icon: ScanSearch },
  { to: "/scan", search: { mode: "bulk" }, label: "Bulk URL Scan", Icon: ListChecks },
  { to: "/reports", label: "Google Reviews", Icon: Star },
  { to: "/removal-center", label: "Risk Analysis", Icon: Globe2 },
  { to: "/history", label: "Scan History", Icon: History },
  { to: "/reports", label: "Reports", Icon: FileText },
  { to: "/storage", label: "Storage Manager", Icon: HardDrive },
  { to: "/settings", label: "Settings", Icon: Settings },
  { to: "/admin/staff", label: "Staff Approvals", Icon: Users },
  { to: "/admin/staff-activity", label: "Staff Activity", Icon: Activity },
] as const;

const staffNav = [
  { to: "/staff/today", label: "Overview", Icon: LayoutDashboard },
  { to: "/staff/tasks", label: "My Tasks", Icon: ClipboardList },
  { to: "/staff/status-board", label: "Status Board", Icon: ListChecks },
  { to: "/staff/performance", label: "Performance", Icon: FileText },
  { to: "/staff/quality", label: "Quality", Icon: CircleHelp },
  { to: "/staff/wallet", label: "Incentive", Icon: CircleDollarSign },
  { to: "/staff/communication", label: "Communication", Icon: Users },
  { to: "/staff/activity", label: "My Activity", Icon: Activity },
  { to: "/staff/evidence", label: "Evidence Vault", Icon: FolderLock },
  { to: "/staff/timeline", label: "Timeline", Icon: GitCommitHorizontal },
  { to: "/staff/lead-activity", label: "Team Review", Icon: ShieldCheck },
  { to: "/staff/alerts", label: "Alerts", Icon: Star },
  { to: "/staff/profile", label: "Profile", Icon: UserRound },
] as const;

const clientNav = [{ to: "/client/outcomes", label: "Review Outcomes", Icon: Activity }] as const;

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <img src="/logo.svg" alt="" width={40} height={40} className="size-10" />
      <div className="leading-tight">
        <div className="font-display text-sm font-bold tracking-tight">
          Rating Guard <span className="text-gradient">Remix</span>
        </div>
        <div className="text-[11px] text-muted-foreground">Review Intelligence Workspace</div>
      </div>
    </div>
  );
}

function SidebarBody({
  email,
  isStaff,
  isSuperAdmin,
  isClient,
  staffPendingCount,
  onNavigate,
}: {
  email: string;
  isStaff: boolean;
  isSuperAdmin: boolean;
  isClient: boolean;
  staffPendingCount: number;
  onNavigate?: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: profile } = useQuery({ ...profileQuery(), enabled: isSuperAdmin });
  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.cancelQueries();
    qc.clear();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Brand />
      <nav className="flex flex-col gap-1" aria-label="Main navigation">
        {(isSuperAdmin ? adminNav : isClient ? clientNav : isStaff ? staffNav : []).map((item) => {
          const { to, label, Icon } = item;
          const linkClass =
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent";
          const activeProps = {
            className:
              "bg-sidebar-accent !text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--primary)]",
          };
          if ("search" in item)
            return (
              <Link
                key={label}
                to="/scan"
                search={{ mode: "bulk" }}
                activeOptions={{ exact: true, includeSearch: true }}
                onClick={onNavigate}
                className={linkClass}
                activeProps={activeProps}
              >
                <Icon className="h-4 w-4 shrink-0" /> {label}
              </Link>
            );
          return (
            <Link
              key={label}
              to={to}
              {...(to === "/scan" ? { activeOptions: { exact: true, includeSearch: true } } : {})}
              onClick={onNavigate}
              className={linkClass}
              activeProps={activeProps}
            >
              <Icon className="h-4 w-4 shrink-0" /> {label}
              {label === "Staff Approvals" && staffPendingCount > 0 && (
                <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">
                  {staffPendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {!isSuperAdmin ? (
        <div className="mt-auto border-t pt-4">
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
          >
            <LogOut className="h-4 w-4 shrink-0" /> Logout
          </button>
        </div>
      ) : (
        <div className="mt-auto space-y-3 border-t pt-4">
          <div className="rounded-xl border border-brand/20 bg-brand-soft/60 p-3">
            <p className="text-xs font-semibold">Keep your Google reputation safe</p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              Review available public data and track scan findings in one place.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled
              title="Billing and plan upgrades are not configured for this workspace."
              className="mt-2 h-7 w-full text-[10px]"
            >
              Upgrade plan
            </Button>
          </div>
          <a
            href="mailto:support@ratingguard.online"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-sidebar-accent"
          >
            <CircleHelp className="h-4 w-4" /> Help &amp; Support
          </a>
          <Link
            to="/profile"
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-sidebar-accent"
            activeProps={{ className: "bg-sidebar-accent" }}
          >
            <Avatar name={profile?.name ?? "Admin"} url={profile?.avatarUrl ?? null} size={28} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{profile?.name ?? "Admin"}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{email}</span>
            </span>
          </Link>
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={logout}
              className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent"
            >
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
          {APP_DOMAIN && (
            <div className="px-3 pt-2 text-[10px] text-muted-foreground">{APP_DOMAIN}</div>
          )}
        </div>
      )}
    </div>
  );
}

export function AppShell({
  email,
  isStaff,
  isSuperAdmin,
  isClient,
  staffPendingCount,
  children,
}: {
  email: string;
  isStaff: boolean;
  isSuperAdmin: boolean;
  isClient: boolean;
  staffPendingCount: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <aside className="no-print fixed inset-y-0 left-0 hidden w-[200px] border-r bg-sidebar backdrop-blur-xl lg:block">
        <SidebarBody
          email={email}
          isStaff={isStaff}
          isSuperAdmin={isSuperAdmin}
          isClient={isClient}
          staffPendingCount={staffPendingCount}
        />
      </aside>
      <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b bg-card/80 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <Button size="sm" asChild>
              <Link to="/scan" search={{}}>
                Scan
              </Link>
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
        </div>
      </header>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SidebarBody
            email={email}
            isStaff={isStaff}
            isSuperAdmin={isSuperAdmin}
            isClient={isClient}
            staffPendingCount={staffPendingCount}
            onNavigate={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
      <main className="lg:pl-[200px]">
        <div className="mx-auto max-w-[1720px] px-4 py-5 sm:px-6">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
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
      <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand">
        <ScanSearch />
      </div>
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
  return (
    <span
      title={error ?? undefined}
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}

export function Avatar({
  name,
  url,
  size = 32,
}: {
  name: string;
  url: string | null;
  size?: number;
}) {
  return url ? (
    <img
      src={url}
      alt={`${name} profile photo`}
      width={size}
      height={size}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-primary font-bold text-primary-foreground"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {(name || "A").slice(0, 1).toUpperCase()}
    </div>
  );
}
