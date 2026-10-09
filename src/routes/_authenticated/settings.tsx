import { SystemQuality, ErrorCenter } from "@/components/ops-panels";
import { HomepageEditor } from "@/components/homepage-editor";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSystemStatus, getAuditLog, logAudit } from "@/lib/scan.functions";
import { getQueueState, resumeQueue } from "@/lib/queue.functions";
import { PageHeader } from "@/components/app-shell";
import { APP_DOMAIN } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — The Rating Guard" }, { name: "description", content: "Account, API, database and system health." }] }),
  component: SettingsPage,
});

type H = "healthy" | "warning" | "unavailable";
const hMeta: Record<H, [string, string, typeof CheckCircle2]> = {
  healthy: ["Healthy", "bg-risk-normal-soft text-risk-normal", CheckCircle2],
  warning: ["Warning", "bg-risk-medium-soft text-risk-medium", AlertTriangle],
  unavailable: ["Unavailable", "bg-risk-high-soft text-risk-high", XCircle],
};
function HBadge({ s, label }: { s: H | undefined; label?: string | undefined }) {
  if (!s) return <span className="text-xs text-muted-foreground">Checking…</span>;
  const [l, cls, Icon] = hMeta[s];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}><Icon className="h-3.5 w-3.5" aria-hidden />{label ?? l}</span>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="surface p-6"><h2 className="mb-5 font-semibold">{title}</h2><div className="space-y-4">{children}</div></section>;
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">{k}</span><span className="text-right">{v}</span></div>;
}

function SettingsPage() {
  const { user } = Route.useRouteContext();
  const status = useServerFn(getSystemStatus);
  const auditFn = useServerFn(getAuditLog);
  const log = useServerFn(logAudit);
  const sysQ = useQuery({ queryKey: ["system-status"], queryFn: () => status() });
  const auditQ = useQuery({ queryKey: ["audit"], queryFn: () => auditFn() });
  const sys = sysQ.data;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [cur, setCur] = useState(""); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [cfgOpen, setCfgOpen] = useState(false);

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) { toast.error("The new passwords don't match."); return; }
    if (pw === cur) { toast.error("The new password must be different from the current one."); return; }
    const { error } = await supabase.auth.updateUser({ password: pw, current_password: cur } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated"); setCur(""); setPw(""); setPw2("");
    log({ data: { action: "settings.password_changed" } }).then(() => auditQ.refetch());
  }
  async function logoutAll() {
    await log({ data: { action: "auth.logout_all" } }).catch(() => {});
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut({ scope: "global" });
    navigate({ to: "/auth", replace: true });
  }
  const check = (n: string) => sys?.checks.find((c) => c.name === n);

  return (
    <>
      <PageHeader title="Settings" subtitle="Account, integrations and system health." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Account">
          <Row k="Name, photo and username" v={<Link to="/profile" className="text-brand hover:underline">Edit on Profile</Link>} />
          <Row k="Admin email" v={user.email} />
          <Row k="Domain" v={APP_DOMAIN} />
          <form onSubmit={changePw} className="space-y-3 border-t pt-4">
            <div className="text-sm font-medium">Password</div>
            <Label htmlFor="cur-pw" className="sr-only">Current password</Label>
            <Input id="cur-pw" type="password" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} required />
            <Label htmlFor="new-pw" className="sr-only">New password</Label>
            <Input id="new-pw" type="password" placeholder="New password (min 8)" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required />
            <Label htmlFor="new-pw2" className="sr-only">Confirm new password</Label>
            <Input id="new-pw2" type="password" placeholder="Confirm new password" minLength={8} value={pw2} onChange={(e) => setPw2(e.target.value)} required />
            <Button type="submit" size="sm">Update password</Button>
          </form>
        </Card>

        <Card title="Google API">
          <Row k="Service" v="Google Places API (New)" />
          <Row k="Configuration status" v={sys ? <HBadge s={sys.googleConfigured ? "healthy" : "warning"} label={sys.googleConfigured ? "Configured" : "Configuration required"} /> : <HBadge s={undefined} />} />
          <Row k="API key" v={<span className="font-mono text-xs">{sys?.googleConfigured ? "•••••••••••••••• (hidden)" : "Not set"}</span>} />
          <Row k="API health" v={<HBadge s={check("Google API")?.status} />} />
          <Row k="Review limit" v={`Up to ${sys?.reviewLimit ?? 5} reviews per business`} />
          <Button variant="outline" onClick={() => setCfgOpen(true)}>Configure API</Button>
        </Card>

        <Card title="AI Analysis">
          <Row k="AI provider" v={sys?.aiProvider ?? "—"} />
          <Row k="AI status" v={<HBadge s={check("AI service")?.status} label={sys?.aiConfigured ? "Active" : undefined} />} />
          <Row k="Model" v={<span className="font-mono text-xs">{sys?.aiModel ?? "—"}</span>} />
          <Row k="Analysis settings" v="Conservative · negative ≠ violation · ambiguous → Requires review" />
        </Card>

        <Card title="Database">
          <Row k="Database status" v={<HBadge s={check("Database")?.status} />} />
          <Row k="Migration status" v={sys ? <HBadge s={sys.migrationsOk ? "healthy" : "warning"} label={sys.migrationsOk ? "Up to date" : "Pending"} /> : <HBadge s={undefined} />} />
          <Row k="Last backup" v="Automatic daily backups (managed by Lovable Cloud)" />
          <Row k="Health" v={<span className="text-xs text-muted-foreground">{check("Database")?.detail ?? "—"}</span>} />
        </Card>

        <QueueCard />

        <section className="surface p-6 lg:col-span-2">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">System health</h2>
              <p className="text-xs text-muted-foreground">Environment: {sys?.environment ?? "—"} · Version {sys?.version ?? "—"} · Checked {sys ? new Date(sys.checkedAt).toLocaleTimeString() : "—"}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => sysQ.refetch()} disabled={sysQ.isFetching}><RefreshCw className={sysQ.isFetching ? "animate-spin" : ""} /> Run health check</Button>
          </div>
          {sysQ.isError && <p role="alert" className="mb-4 text-sm text-risk-high">Health check failed: the application server did not respond.</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(sys?.checks ?? []).map((c) => (
              <div key={c.name} className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2"><span className="font-medium">{c.name}</span><HBadge s={c.status} /></div>
                <p className="mt-2 text-xs text-muted-foreground">{c.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <Card title="Recent admin activity">
          {(auditQ.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No activity yet.</p> :
            auditQ.data!.map((a, i) => <Row key={i} k={a.action} v={<span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>} />)}
        </Card>

        <Card title="Security">
          <Row k="Current session" v={user.last_sign_in_at ? `Signed in ${new Date(user.last_sign_in_at).toLocaleString()}` : "Active"} />
          <Button variant="outline" onClick={logoutAll}>Log out of all sessions</Button>
        </Card>
      </div>

      <Dialog open={cfgOpen} onOpenChange={setCfgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Google Places API</DialogTitle>
            <DialogDescription>The key is stored securely on the server and is never shown in the browser.</DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Open Google Cloud Console → APIs &amp; Services and enable <b>Places API (New)</b> (billing required).</li>
            <li>Create an API key under Credentials. Restrict it to Places API (New). Set application restrictions to <b>None</b> or <b>IP addresses</b> — not websites.</li>
            <li>Google Places and OpenAI keys are stored as server-only secrets (GOOGLE_PLACES_API_KEY, OPENAI_API_KEY).</li>
            <li>Click <b>Run health check</b> — the status turns to Configured and live scanning starts automatically.</li>
          </ol>
        </DialogContent>
      </Dialog>
      <section className="surface mt-6 p-5">
        <h2 className="mb-4 text-lg font-semibold">Homepage content</h2>
        <HomepageEditor />
      </section>
      <SystemQuality health={sys?.checks} />
      <ErrorCenter />
    </>
  );
}

function QueueCard() {
  const getState = useServerFn(getQueueState);
  const resume = useServerFn(resumeQueue);
  const [q, setQ] = useState<Awaited<ReturnType<typeof getQueueState>> | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => getState().then(setQ).catch(() => setQ(null));
  useEffect(() => { void load(); }, []);
  return (
    <section className="surface p-6 lg:col-span-2">
      <h2 className="mb-5 font-semibold">Bulk scan queue</h2>
      <div className="space-y-4">
        <Row k="Queue status" v={q ? <HBadge s={q.queue_paused ? "unavailable" : "healthy"} label={q.queue_paused ? "Paused" : "Running"} /> : <HBadge s={undefined} />} />
        {q?.queue_paused && <Row k="Pause reason" v={<span className="text-sm text-risk-high">{q.pause_reason}</span>} />}
        <Row k="Links waiting" v={q?.pending ?? "—"} />
        <Row k="Links used today (UTC)" v={q ? `${q.usedToday} of ${q.daily_link_cap}` : "—"} />
        <Row k="Last worker run" v={q?.last_worker_run ? new Date(q.last_worker_run).toLocaleString() : "Not yet"} />
        {q?.queue_paused && q.isAdmin && (
          <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); try { await resume(); await load(); } finally { setBusy(false); } }}>Resume queue</Button>
        )}
      </div>
    </section>
  );
}
