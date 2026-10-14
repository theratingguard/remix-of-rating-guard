import { SystemQuality, ErrorCenter } from "@/components/ops-panels";
import { HomepageEditor } from "@/components/homepage-editor";
import { AiControlPanel } from "@/components/ai-control-panel";
import { WorkersStatus } from "@/components/workers-status";
import { ReplyAutomationSettings } from "@/components/reply-automation-settings";
import { LegalWorkersPanel } from "@/components/legal-workers-panel";
import { MemoryStatus } from "@/components/memory-status";
import { reportAccessQuery } from "@/components/restricted-report-summary";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSystemStatus, getAuditLog, logAudit } from "@/lib/scan.functions";
import { getQueueState, resumeQueue } from "@/lib/queue.functions";
import { getIntegrationChecks, testGoogleIntegration } from "@/lib/integration-checks.functions";
import { PageHeader } from "@/components/app-shell";
import { APP_DOMAIN } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AI_LAYER_TARGETS, estimateAiSavingsPercent } from "@/lib/ai-layer-usage";
import { getAiLayerUsage } from "@/lib/ai-layer-usage.functions";
import { MICRO_RULE_CHECK_COUNT, RULE_GROUP_COUNTS, RULE_GROUP_LABELS } from "@/lib/rules/scoring";
import { QUALITY_BOOSTERS, summarizeQualityBoosters } from "@/lib/rules/quality-boosters";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Rating Guard Remix" },
      { name: "description", content: "Account, API, database and system health." },
    ],
  }),
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
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label ?? l}
    </span>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface p-6">
      <h2 className="mb-5 font-semibold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

function SettingsPage() {
  const access = useQuery(reportAccessQuery());
  const { user } = Route.useRouteContext();
  const status = useServerFn(getSystemStatus);
  const auditFn = useServerFn(getAuditLog);
  const log = useServerFn(logAudit);
  const sysQ = useQuery({ queryKey: ["system-status"], queryFn: () => status() });
  const auditQ = useQuery({ queryKey: ["audit"], queryFn: () => auditFn() });
  const sys = sysQ.data;
  const integrations = useServerFn(getIntegrationChecks),
    testGoogle = useServerFn(testGoogleIntegration);
  const integrationsQ = useQuery({
    queryKey: ["integration-checks"],
    queryFn: () => integrations(),
    enabled: access.data === "super_admin",
  });
  const getAiUsage = useServerFn(getAiLayerUsage);
  const aiUsageQ = useQuery({
    queryKey: ["ai-layer-usage"],
    queryFn: () => getAiUsage(),
    enabled: access.data === "super_admin",
  });
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleCheck = integrationsQ.data?.checks.find((check) => check.service === "google");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [cfgOpen, setCfgOpen] = useState(false);

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) {
      toast.error("The new passwords don't match.");
      return;
    }
    if (pw === cur) {
      toast.error("The new password must be different from the current one.");
      return;
    }
    const { error } = await supabase.auth.updateUser({
      password: pw,
      current_password: cur,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated");
    setCur("");
    setPw("");
    setPw2("");
    log({ data: { action: "settings.password_changed" } }).then(() => auditQ.refetch());
  }
  async function logoutAll() {
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.cancelQueries();
    qc.clear();
    navigate({ to: "/auth", replace: true });
  }
  const check = (n: string) => sys?.checks.find((c) => c.name === n);

  return (
    <>
      <PageHeader title="Settings" subtitle="Account, integrations and system health." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Account">
          <Row
            k="Name, photo and username"
            v={
              <Link to="/profile" className="text-brand hover:underline">
                Edit on Profile
              </Link>
            }
          />
          <Row k="Admin email" v={user.email} />
          <Row k="Domain" v={APP_DOMAIN} />
          <form onSubmit={changePw} className="space-y-3 border-t pt-4">
            <div className="text-sm font-medium">Password</div>
            <Label htmlFor="cur-pw" className="sr-only">
              Current password
            </Label>
            <Input
              id="cur-pw"
              type="password"
              placeholder="Current password"
              value={cur}
              onChange={(e) => setCur(e.target.value)}
              required
            />
            <Label htmlFor="new-pw" className="sr-only">
              New password
            </Label>
            <Input
              id="new-pw"
              type="password"
              placeholder="New password (min 8)"
              minLength={8}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
            />
            <Label htmlFor="new-pw2" className="sr-only">
              Confirm new password
            </Label>
            <Input
              id="new-pw2"
              type="password"
              placeholder="Confirm new password"
              minLength={8}
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              required
            />
            <Button type="submit" size="sm">
              Update password
            </Button>
          </form>
        </Card>
        <Card title="Auto Reply">
          <ReplyAutomationSettings />
        </Card>
        <Card title="Google API">
          <Row k="Service" v="Google Places API (New)" />
          <Row
            k="Configuration status"
            v={
              sys ? (
                <HBadge
                  s={sys.googleConfigured ? "healthy" : "warning"}
                  label={sys.googleConfigured ? "Configured" : "Configuration required"}
                />
              ) : (
                <HBadge s={undefined} />
              )
            }
          />
          <Row
            k="API key"
            v={
              <span className="font-mono text-xs">
                {sys?.googleConfigured ? "•••••••••••••••• (hidden)" : "Not set"}
              </span>
            }
          />
          {access.data === "super_admin" && (
            <div className="space-y-2 text-sm">
              <button className="text-brand underline" onClick={() => setCfgOpen(true)}>
                View Google API status and configuration details
              </button>
              <p>
                Last verified / tested:{" "}
                {googleCheck ? new Date(googleCheck.checked_at).toLocaleString() : "Not tested"}
                {googleCheck
                  ? ` — ${googleCheck.success ? "Verified" : "Failed"}: ${googleCheck.detail}`
                  : ""}
              </p>
              <Button
                disabled={googleBusy}
                variant="outline"
                onClick={async () => {
                  setGoogleBusy(true);
                  try {
                    const result = await testGoogle();
                    await integrationsQ.refetch();
                    if (result.success) toast.success(result.detail);
                    else toast.error(result.detail);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Google test failed.");
                  } finally {
                    setGoogleBusy(false);
                  }
                }}
              >
                {googleBusy ? "Testing..." : "Test Google API"}
              </Button>
            </div>
          )}
          <Row k="API health" v={<HBadge s={check("Google API")?.status} />} />
          <Row k="Review limit" v={`Up to ${sys?.reviewLimit ?? 5} reviews per business`} />
          <Button variant="outline" onClick={() => setCfgOpen(true)}>
            Configure API
          </Button>
        </Card>

        <Card title="AI Analysis">
          {access.data === "super_admin" && <AiControlPanel />}
          <Row k="AI provider" v={sys?.aiProvider ?? "—"} />
          <Row
            k="Last verified scan"
            v={
              integrationsQ.data?.lastScanVerified
                ? new Date(integrationsQ.data.lastScanVerified).toLocaleString()
                : "No completed live scan recorded"
            }
          />
          <Row
            k="AI status"
            v={
              <HBadge
                s={check("AI service")?.status}
                label={sys?.aiConfigured ? "Key configured (not a health test)" : undefined}
              />
            }
          />
          <Row k="Model" v={<span className="font-mono text-xs">{sys?.aiModel ?? "—"}</span>} />
          <Row
            k="Analysis settings"
            v="Conservative · negative ≠ violation · ambiguous → Requires review"
          />
          {access.data === "super_admin" && (
            <div className="space-y-3 border-t pt-3 text-sm">
              <div className="font-medium">AI Usage</div>
              {(["rules", "ollama", "gpt"] as const).map((layer) => {
                const actual = aiUsageQ.data?.layers.find((item) => item.layer === layer);
                const target = AI_LAYER_TARGETS[layer];
                const label =
                  layer === "rules"
                    ? "Layer 1 (Rules)"
                    : layer === "ollama"
                      ? "Layer 2 (Ollama)"
                      : "Layer 3 (GPT)";
                return (
                  <Row
                    key={layer}
                    k={label}
                    v={`${actual?.handled_percent.toFixed(1) ?? "0.0"}% · ${actual?.cases ?? 0} cases · ${
                      layer === "gpt" ? `$${(actual?.cost_usd ?? 0).toFixed(4)}` : "₹0"
                    } · ${actual?.avg_duration_ms ?? 0}ms avg · target ${target.handledPercent}%`}
                  />
                );
              })}
              <Row
                k="Average cost per scan (month)"
                v={`$${(aiUsageQ.data?.month_avg_cost_per_scan_usd ?? 0).toFixed(4)} · ${
                  aiUsageQ.data?.month_scan_count ?? 0
                } scans`}
              />
              <Row
                k="Latest scan cost"
                v={`$${(aiUsageQ.data?.latest_scan_cost_usd ?? 0).toFixed(4)} · ${
                  aiUsageQ.data?.latest_scan_cases ?? 0
                } reviews`}
              />
              <Row
                k="Today"
                v={`$${(aiUsageQ.data?.today_cost_usd ?? 0).toFixed(4)} · ${aiUsageQ.data?.today_cases ?? 0} cases`}
              />
              <Row
                k="Month"
                v={`$${(aiUsageQ.data?.month_cost_usd ?? 0).toFixed(4)} · ${aiUsageQ.data?.month_cases ?? 0} cases`}
              />
              <Row
                k="Estimated savings vs GPT-only"
                v={`$${Math.max(
                  0,
                  (aiUsageQ.data?.month_cases ?? 0) * AI_LAYER_TARGETS.gpt.costUsd -
                    (aiUsageQ.data?.month_cost_usd ?? 0),
                ).toFixed(4)} · ${
                  estimateAiSavingsPercent(
                    aiUsageQ.data?.month_cases ?? 0,
                    aiUsageQ.data?.month_cost_usd ?? 0,
                  )?.toFixed(1) ?? "—"
                }%`}
              />
              {aiUsageQ.isError && (
                <p className="text-sm text-destructive">Could not load recorded AI usage.</p>
              )}
              <p className="text-xs text-muted-foreground">
                Costs and savings are estimates using $0.01 per GPT-only review; verify against
                provider billing. No INR conversion is applied.
              </p>
              <div className="space-y-2 border-t pt-3 text-sm">
                <div className="font-medium">Rules Engine Stats</div>
                {Object.entries(RULE_GROUP_COUNTS).map(([group, count]) => (
                  <Row
                    key={group}
                    k={RULE_GROUP_LABELS[group as keyof typeof RULE_GROUP_LABELS]}
                    v={`${count} checks`}
                  />
                ))}
                <Row k="Configured micro-checks per review" v={MICRO_RULE_CHECK_COUNT} />
                <div className="space-y-2 border-t pt-3">
                  <div className="font-medium">Quality boosters · implementation status</div>
                  <Row
                    k="Available · limited · unavailable"
                    v={(() => {
                      const summary = summarizeQualityBoosters();
                      return `${summary.available} · ${summary.limited} · ${summary.unavailable}`;
                    })()}
                  />
                  {QUALITY_BOOSTERS.map((booster) => (
                    <Row
                      key={booster.id}
                      k={`${booster.name} · ${booster.status}`}
                      v={<span className="text-xs text-muted-foreground">{booster.scope}</span>}
                    />
                  ))}
                  <p className="text-xs text-muted-foreground">
                    No calibration curve or accuracy percentage is claimed. A booster marked limited
                    or unavailable must not be interpreted as verified evidence.
                  </p>
                </div>
                <Row
                  k="Target rules-layer runtime"
                  v={`${AI_LAYER_TARGETS.rules.avgDurationMs} ms per review`}
                />
                <Row
                  k="Average rules-layer runtime"
                  v={
                    aiUsageQ.data?.layers.find((item) => item.layer === "rules")?.cases
                      ? `${aiUsageQ.data.layers.find((item) => item.layer === "rules")?.avg_duration_ms} ms (recorded)`
                      : "No recorded rules runs"
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Check inventory is not the same as assessed evidence. Checks needing unavailable
                  profile, platform, network, or event data are marked unassessed; no IP/device
                  fingerprinting or external enrichment is performed. The 0–100 score is advisory,
                  uncalibrated, and is not a probability, policy verdict, or proof of removal.
                </p>
              </div>
            </div>
          )}
        </Card>

        <Card title="Database">
          <Row k="Database status" v={<HBadge s={check("Database")?.status} />} />
          <Row
            k="Migration status"
            v={
              sys ? (
                <HBadge
                  s={sys.migrationsOk ? "healthy" : "warning"}
                  label={sys.migrationsOk ? "Up to date" : "Pending"}
                />
              ) : (
                <HBadge s={undefined} />
              )
            }
          />
          <Row k="Last backup" v="Not verified; check Supabase project backup settings" />
          <Button variant="outline" asChild>
            <a
              href="https://supabase.com/dashboard/project/bdudkvrsbznpmyfzsahm/database/backups"
              target="_blank"
              rel="noopener noreferrer"
            >
              Set up / verify database backups
            </a>
          </Button>
          <p className="text-sm">
            Opens Supabase backup configuration. No backup is claimed until configured and verified
            there.
          </p>
          <Row
            k="Health"
            v={
              <span className="text-xs text-muted-foreground">
                {check("Database")?.detail ?? "—"}
              </span>
            }
          />
        </Card>

        <QueueCard />

        <section className="surface p-6 lg:col-span-2">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">System health</h2>
              <p className="text-xs text-muted-foreground">
                Environment: {sys?.environment ?? "—"} · Version {sys?.version ?? "—"} · Checked{" "}
                {sys ? new Date(sys.checkedAt).toLocaleTimeString() : "—"}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => sysQ.refetch()}
              disabled={sysQ.isFetching}
            >
              <RefreshCw className={sysQ.isFetching ? "animate-spin" : ""} /> Run health check
            </Button>
          </div>
          {sysQ.isError && (
            <p role="alert" className="mb-4 text-sm text-risk-high">
              Health check failed: the application server did not respond.
            </p>
          )}
          {integrationsQ.error && (
            <p role="alert">Integration diagnostics failed: {integrationsQ.error.message}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(sys?.checks ?? []).map((c) => (
              <details key={c.name} className="rounded-lg border p-4">
                <summary className="cursor-pointer">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{c.name}</span>
                    <HBadge s={c.status} />
                  </div>
                </summary>
                <p className="mt-2 text-xs text-muted-foreground">{c.detail}</p>
              </details>
            ))}
          </div>
        </section>

        <Card title="Recent admin activity">
          {(auditQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            auditQ.data!.map((a, i) => (
              <Row
                key={i}
                k={a.action}
                v={
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                }
              />
            ))
          )}
        </Card>

        <Card title="Security">
          <Row
            k="Current session"
            v={
              user.last_sign_in_at
                ? `Signed in ${new Date(user.last_sign_in_at).toLocaleString()}`
                : "Active"
            }
          />
          <Button variant="outline" onClick={logoutAll}>
            Log out of all sessions
          </Button>
        </Card>
      </div>

      <Dialog open={cfgOpen} onOpenChange={setCfgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Google Places API</DialogTitle>
            <DialogDescription>
              The key is stored securely on the server and is never shown in the browser.
            </DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              Open Google Cloud Console → APIs &amp; Services and enable <b>Places API (New)</b>{" "}
              (billing required).
            </li>
            <li>
              Create an API key under Credentials. Restrict it to Places API (New). Set application
              restrictions to <b>None</b> or <b>IP addresses</b> — not websites.
            </li>
            <li>
              Google Places and OpenAI keys are stored as server-only secrets
              (GOOGLE_PLACES_API_KEY, OPENAI_API_KEY).
            </li>
            <li>
              Click <b>Run health check</b> — the status turns to Configured and live scanning
              starts automatically.
            </li>
          </ol>
        </DialogContent>
      </Dialog>
      <section className="surface mt-6 p-5">
        <h2 className="mb-4 text-lg font-semibold">Homepage content</h2>
        <HomepageEditor />
      </section>
      <SystemQuality health={sys?.checks} />
      {access.data === "super_admin" && <WorkersStatus />}
      {access.data === "super_admin" && <LegalWorkersPanel />}
      {access.data === "super_admin" && <MemoryStatus />}
      <ErrorCenter />
    </>
  );
}

function QueueCard() {
  const getState = useServerFn(getQueueState);
  const resume = useServerFn(resumeQueue);
  const [q, setQ] = useState<Awaited<ReturnType<typeof getQueueState>> | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () =>
    getState()
      .then(setQ)
      .catch(() => setQ(null));
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="surface p-6 lg:col-span-2">
      <h2 className="mb-5 font-semibold">Bulk scan queue</h2>
      <div className="space-y-4">
        <Row
          k="Queue status"
          v={
            q ? (
              <HBadge
                s={q.queue_paused ? "unavailable" : "healthy"}
                label={q.queue_paused ? "Paused" : "Running"}
              />
            ) : (
              <HBadge s={undefined} />
            )
          }
        />
        {q?.queue_paused && (
          <Row
            k="Pause reason"
            v={<span className="text-sm text-risk-high">{q.pause_reason}</span>}
          />
        )}
        <Row k="Links waiting" v={q?.pending ?? "—"} />
        <Row k="Links used today (UTC)" v={q ? `${q.usedToday} of ${q.daily_link_cap}` : "—"} />
        <Row
          k="Last worker run"
          v={q?.last_worker_run ? new Date(q.last_worker_run).toLocaleString() : "Not yet"}
        />
        {q?.queue_paused && q.isAdmin && (
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await resume();
                await load();
              } finally {
                setBusy(false);
              }
            }}
          >
            Resume queue
          </Button>
        )}
      </div>
    </section>
  );
}
