import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import {
  getStaffDashboard,
  saveStaffPayoutDetails,
  sendStaffAdminMessage,
  updateStaffTaskStatus,
} from "@/lib/staff-dashboard.functions";
import { analyzeStaffReply, updateMyStaffLiveStatus } from "@/lib/staff-case.functions";
import { getStaffPerformanceMetrics, getStaffWalletSummary } from "@/lib/staff-dashboard-metrics";
import { getInactiveReviews } from "@/lib/evidence-tracking";

const dashboardKey = ["staff-dashboard"];
const activeStatuses = new Set(["open", "accepted", "in_progress", "rework"]);
const completedStatuses = new Set(["approved", "completed", "closed"]);
const boardColumns = [
  ["New", ["open"]],
  ["Accepted", ["accepted"]],
  ["In Progress", ["in_progress"]],
  ["Submitted", ["submitted", "reply_received"]],
  ["Approved", ["approved"]],
  ["Rejected", ["rejected"]],
  ["Rework", ["rework"]],
  ["Completed", ["completed", "closed"]],
] as const;

type StaffDashboardData = Awaited<ReturnType<typeof getStaffDashboard>>;
type DashboardCase = StaffDashboardData["cases"][number];
type DashboardModule =
  | "overview"
  | "tasks"
  | "status-board"
  | "performance"
  | "quality"
  | "incentive"
  | "communication"
  | "alerts"
  | "profile";

function badge(status: string) {
  const theme: Record<string, string> = {
    open: "bg-amber-100 text-amber-900",
    accepted: "bg-sky-100 text-sky-900",
    in_progress: "bg-blue-100 text-blue-900",
    submitted: "bg-orange-100 text-orange-900",
    reply_received: "bg-orange-100 text-orange-900",
    approved: "bg-emerald-100 text-emerald-900",
    rejected: "bg-rose-100 text-rose-900",
    rework: "bg-violet-100 text-violet-900",
    completed: "bg-emerald-100 text-emerald-900",
    closed: "bg-emerald-100 text-emerald-900",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${theme[status] ?? "bg-muted"}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function Metric({ title, value, note }: { title: string; value: string | number; note?: string }) {
  return (
    <article className="surface p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </article>
  );
}

function CaseCard({ task, children }: { task: DashboardCase; children?: ReactNode }) {
  return (
    <article className="surface space-y-4 p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{task.business_name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {task.business_region || "Region not provided"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border px-2.5 py-1 text-xs">{task.priority}</span>
          {badge(task.status)}
        </div>
      </header>
      <div className="rounded-lg border p-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Review</p>
        <p className="mt-2 whitespace-pre-wrap text-sm">
          {task.review_text || "Review text unavailable."}
        </p>
      </div>
      {task.deadline_at && (
        <p className="text-xs text-muted-foreground">
          Deadline: {new Date(task.deadline_at).toLocaleString()}
        </p>
      )}
      {children}
    </article>
  );
}

function Overview({ data }: { data: StaffDashboardData }) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const assignedToday = data.cases.filter(
    (task) => new Date(task.assigned_at).getTime() >= start.getTime(),
  ).length;
  const pending = data.cases.filter((task) => activeStatuses.has(task.status)).length;
  const completed = data.cases.filter((task) => completedStatuses.has(task.status)).length;
  const decided = data.cases.filter((task) =>
    ["approved", "rejected", "completed", "closed"].includes(task.status),
  );
  const approvals = decided.filter((task) =>
    ["approved", "completed", "closed"].includes(task.status),
  ).length;
  const approvalRate = decided.length ? Math.round((approvals / decided.length) * 100) : 0;
  const rework = data.cases.filter((task) => task.status === "rework").length;
  return (
    <div className="space-y-5">
      <PageHeader title="Overview" subtitle={`Welcome, ${data.profile.name}`} />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric title="Today's assigned" value={assignedToday} />
        <Metric title="Pending" value={pending} />
        <Metric title="Completed" value={completed} />
        <Metric title="Approval rate" value={`${approvalRate}%`} />
        <Metric title="Rework count" value={rework} />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Current tasks</h2>
        {data.cases
          .filter((task) => activeStatuses.has(task.status))
          .slice(0, 3)
          .map((task) => (
            <CaseCard key={task.id} task={task} />
          ))}
        {!data.cases.some((task) => activeStatuses.has(task.status)) && (
          <p className="surface p-5 text-sm text-muted-foreground">No active tasks assigned.</p>
        )}
      </section>
    </div>
  );
}

function MyTasks({ data, refresh }: { data: StaffDashboardData; refresh: () => Promise<void> }) {
  const transition = useServerFn(updateStaffTaskStatus);
  const analyze = useServerFn(analyzeStaffReply);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [replyById, setReplyById] = useState<Record<string, string>>({});
  const tasks = data.cases.filter((task) => activeStatuses.has(task.status));

  async function act(task: DashboardCase, action: "accept" | "reject" | "start" | "submit") {
    const reason =
      action === "reject" ? window.prompt("Reason for rejecting this task:")?.trim() : undefined;
    if (action === "reject" && !reason) return;
    const confirmed =
      action === "submit" &&
      window.confirm("Did you personally submit this request through Google's official channel?");
    if (action === "submit" && !confirmed) return;
    setBusyId(task.id);
    try {
      await transition({
        data: {
          caseId: task.id,
          action,
          ...(reason ? { reason } : {}),
          ...(confirmed ? { confirmed: true } : {}),
        },
      });
      await refresh();
      toast.success(`Task ${action === "start" ? "started" : `${action}ed`}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update task.");
    } finally {
      setBusyId(null);
    }
  }

  async function copyReport(task: DashboardCase) {
    setCopyingId(task.id);
    try {
      await navigator.clipboard.writeText(task.report_text);
      toast.success("Report copied. Review all evidence before use.");
    } catch (error) {
      console.error("[staff-dashboard] Report copy failed", error);
      toast.error("Could not copy the report.");
    } finally {
      setCopyingId(null);
    }
  }

  async function analyzeReply(task: DashboardCase) {
    const reply = (replyById[task.id] ?? "").trim();
    if (reply.length < 3) {
      toast.error("Paste the actual Google reply first.");
      return;
    }
    setBusyId(task.id);
    try {
      await analyze({ data: { caseId: task.id, reply } });
      await refresh();
      toast.success("Reply analyzed and recorded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not analyze the reply.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="My Tasks" subtitle={`${tasks.length} active tasks`} />
      {!tasks.length && (
        <p className="surface p-5 text-sm text-muted-foreground">No active tasks assigned.</p>
      )}
      {tasks.map((task) => (
        <CaseCard key={task.id} task={task}>
          <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm font-sans">
            {task.report_text}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={copyingId === task.id}
              onClick={() => void copyReport(task)}
            >
              {copyingId === task.id ? "Copying…" : "Copy report"}
            </Button>
            <Button asChild variant="outline">
              <a href={task.review_url} target="_blank" rel="noreferrer">
                Open Google review
              </a>
            </Button>
            {task.status === "open" && (
              <>
                <Button disabled={busyId === task.id} onClick={() => void act(task, "accept")}>
                  Accept
                </Button>
                <Button
                  variant="destructive"
                  disabled={busyId === task.id}
                  onClick={() => void act(task, "reject")}
                >
                  Reject
                </Button>
              </>
            )}
            {["accepted", "rework"].includes(task.status) && (
              <>
                <Button disabled={busyId === task.id} onClick={() => void act(task, "start")}>
                  Start
                </Button>
                <Button
                  variant="destructive"
                  disabled={busyId === task.id}
                  onClick={() => void act(task, "reject")}
                >
                  Reject
                </Button>
              </>
            )}
            {task.status === "in_progress" && (
              <div className="w-full space-y-3">
                <div className="space-y-2">
                  <Label htmlFor={`task-reply-${task.id}`}>Paste a Google reply, if received</Label>
                  <Textarea
                    id={`task-reply-${task.id}`}
                    rows={3}
                    maxLength={5000}
                    value={replyById[task.id] ?? ""}
                    onChange={(event) =>
                      setReplyById((current) => ({ ...current, [task.id]: event.target.value }))
                    }
                    placeholder="Paste the actual reply without editing…"
                  />
                  <Button
                    variant="secondary"
                    disabled={busyId === task.id || (replyById[task.id] ?? "").trim().length < 3}
                    onClick={() => void analyzeReply(task)}
                  >
                    Analyze reply
                  </Button>
                </div>
                <Button disabled={busyId === task.id} onClick={() => void act(task, "submit")}>
                  {busyId === task.id ? "Submitting…" : "Submit"}
                </Button>
              </div>
            )}
            {task.status === "rework" && (
              <p className="w-full rounded-lg border border-violet-300 p-3 text-sm">
                {task.rework_instructions || "Rework instructions have not been provided yet."}
              </p>
            )}
          </div>
        </CaseCard>
      ))}
    </div>
  );
}

function StatusBoard({ data }: { data: StaffDashboardData }) {
  const queryClient = useQueryClient();
  const transition = useServerFn(updateStaffTaskStatus);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function moveTask(task: DashboardCase, target: "accepted" | "in_progress") {
    const action =
      target === "accepted" && task.status === "open"
        ? "accept"
        : target === "in_progress" && ["accepted", "rework"].includes(task.status)
          ? "start"
          : null;
    if (!action || busyId) return;
    const previous = queryClient.getQueryData<StaffDashboardData>(dashboardKey);
    if (!previous) return;
    setBusyId(task.id);
    queryClient.setQueryData<StaffDashboardData>(dashboardKey, {
      ...previous,
      cases: previous.cases.map((item) =>
        item.id === task.id
          ? { ...item, status: target, updated_at: new Date().toISOString() }
          : item,
      ),
    });
    try {
      await transition({ data: { caseId: task.id, action } });
      await queryClient.invalidateQueries({ queryKey: dashboardKey });
    } catch (error) {
      queryClient.setQueryData(dashboardKey, previous);
      toast.error(error instanceof Error ? error.message : "Could not move this task.");
    } finally {
      setBusyId(null);
      setDraggedId(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Status Board"
        subtitle="Drag Open to Accepted or Accepted/Rework to In Progress. Other status changes are admin-managed."
      />
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {boardColumns.map(([title, statuses]) => {
          const tasks = data.cases.filter((task) =>
            (statuses as readonly string[]).includes(task.status),
          );
          return (
            <section
              className={`surface min-h-44 space-y-3 p-4 ${draggedId ? "border-primary/50" : ""}`}
              key={title}
              onDragOver={(event) => {
                const columnStatuses = statuses as readonly string[];
                if (columnStatuses.includes("accepted") || columnStatuses.includes("in_progress"))
                  event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const caseId = event.dataTransfer.getData("text/plain");
                const task = data.cases.find((item) => item.id === caseId);
                const columnStatuses = statuses as readonly string[];
                const target = columnStatuses.includes("accepted")
                  ? "accepted"
                  : columnStatuses.includes("in_progress")
                    ? "in_progress"
                    : null;
                if (task && target) void moveTask(task, target);
              }}
            >
              <header className="flex items-center justify-between">
                <h2 className="font-semibold">{title}</h2>
                <span className="text-sm text-muted-foreground">{tasks.length}</span>
              </header>
              {tasks.map((task) => (
                <article
                  className={`rounded-lg border p-3 text-sm ${
                    ["open", "accepted", "rework"].includes(task.status)
                      ? "cursor-grab active:cursor-grabbing"
                      : ""
                  }`}
                  key={task.id}
                  draggable={["open", "accepted", "rework"].includes(task.status)}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", task.id);
                    event.dataTransfer.effectAllowed = "move";
                    setDraggedId(task.id);
                  }}
                  onDragEnd={() => setDraggedId(null)}
                >
                  <p className="font-medium">{task.business_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{task.priority}</p>
                  {task.status === "open" && (
                    <Button
                      className="mt-2 h-8"
                      size="sm"
                      variant="outline"
                      disabled={busyId === task.id}
                      onClick={() => void moveTask(task, "accepted")}
                    >
                      Accept
                    </Button>
                  )}
                  {["accepted", "rework"].includes(task.status) && (
                    <Button
                      className="mt-2 h-8"
                      size="sm"
                      variant="outline"
                      disabled={busyId === task.id}
                      onClick={() => void moveTask(task, "in_progress")}
                    >
                      Start
                    </Button>
                  )}
                </article>
              ))}
              {!tasks.length && <p className="text-xs text-muted-foreground">No tasks</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Performance({ data }: { data: StaffDashboardData }) {
  const total = data.cases.length;
  const metrics = getStaffPerformanceMetrics(data.cases, data.profile.monthly_task_target);
  const qualityScore = total
    ? Math.max(0, Math.round((1 - metrics.reworkRejected / total) * 100))
    : 0;
  return (
    <div className="space-y-5">
      <PageHeader title="Performance" subtitle="Personal case outcomes and workload." />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Total assigned" value={total} />
        <Metric title="Completed" value={metrics.completed} />
        <Metric title="Pending" value={metrics.pending} />
        <Metric
          title="First-time approval rate"
          value={metrics.firstAttemptRate === null ? "—" : `${metrics.firstAttemptRate}%`}
          note={`${metrics.firstAttemptApprovals} first-attempt approvals / ${metrics.firstAttemptDecisions} decided cases`}
        />
        <Metric title="Rework / rejection" value={metrics.reworkRejected} />
        <Metric
          title="Average TAT"
          value={metrics.averageTatHours === null ? "—" : `${metrics.averageTatHours.toFixed(1)} h`}
          note="Average elapsed time from assignment to case closure"
        />
        <Metric title="Quality score" value={`${qualityScore}%`} />
        <Metric
          title="Target vs achieved"
          value={
            metrics.monthlyTarget
              ? `${metrics.achievedThisMonth} / ${metrics.monthlyTarget}`
              : `${metrics.achievedThisMonth} / Not set`
          }
          note="Completed this UTC calendar month vs admin-set target"
        />
      </section>
    </div>
  );
}

function Quality({ data }: { data: StaffDashboardData }) {
  const flagged = data.cases.filter(
    (task) =>
      ["rework", "rejected"].includes(task.status) || task.tl_remarks || task.mistake_category,
  );
  return (
    <div className="space-y-5">
      <PageHeader title="Quality / Rework" subtitle="Review feedback and required corrections." />
      {!flagged.length && !data.qualityNotes.length && (
        <p className="surface p-5 text-sm text-muted-foreground">No quality or rework remarks.</p>
      )}
      {flagged.map((task) => (
        <CaseCard key={task.id} task={task}>
          <dl className="grid gap-3 sm:grid-cols-2">
            {[
              ["Team Lead remarks", task.tl_remarks],
              ["Rejection reason", task.staff_decision_reason],
              ["Rework instructions", task.rework_instructions],
              ["Mistake category", task.mistake_category],
            ].map(([label, value]) => (
              <div className="rounded-lg border p-3" key={label}>
                <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-sm">{value || "Not provided"}</dd>
              </div>
            ))}
            <section className="surface space-y-3 p-5" aria-label="Warning and appreciation notes">
              <h2 className="font-semibold">Warning / Appreciation notes</h2>
              {data.qualityNotes.map((item) => (
                <article className="rounded-lg border p-3" key={item.id}>
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="font-semibold capitalize">{item.note_type}</p>
                    <time className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString()}
                    </time>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{item.note}</p>
                </article>
              ))}
              {!data.qualityNotes.length && (
                <p className="text-sm text-muted-foreground">No warning or appreciation notes.</p>
              )}
            </section>
          </dl>
        </CaseCard>
      ))}
    </div>
  );
}

function Incentive({ data, refresh }: { data: StaffDashboardData; refresh: () => Promise<void> }) {
  const save = useServerFn(saveStaffPayoutDetails);
  const [method, setMethod] = useState<"upi" | "bank" | "binance">("upi");
  const [upiId, setUpiId] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankHolder, setBankHolder] = useState("");
  const [bankLast4, setBankLast4] = useState("");
  const [binanceId, setBinanceId] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!data.payout) return;
    setMethod(data.payout.method);
    setUpiId(data.payout.upi_id ?? "");
    setBankName(data.payout.bank_name ?? "");
    setBankHolder(data.payout.bank_holder ?? "");
    setBankLast4(data.payout.bank_account_last4 ?? "");
    setBinanceId(data.payout.binance_pay_id ?? "");
  }, [data.payout]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await save({
        data: {
          method,
          ...(method === "upi" ? { upi_id: upiId } : {}),
          ...(method === "bank"
            ? { bank_name: bankName, bank_holder: bankHolder, bank_account_last4: bankLast4 }
            : {}),
          ...(method === "binance" ? { binance_pay_id: binanceId } : {}),
        },
      });
      await refresh();
      toast.success("Payout details saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save payout details.");
    } finally {
      setBusy(false);
    }
  }

  const credits = data.credits.reduce((sum, item) => sum + item.amount, 0);
  const wallet = getStaffWalletSummary(data.credits, data.walletLedger, data.cases);
  const transactions = [
    ...data.credits.map((entry) => ({
      id: entry.id,
      created_at: entry.created_at,
      amount: entry.amount * 10,
      reason: entry.reason,
      label: "Credit",
    })),
    ...data.walletLedger.map((entry) => ({
      id: entry.id,
      created_at: entry.created_at,
      amount: entry.transaction_type === "penalty" ? -entry.amount : entry.amount,
      reason: entry.reason,
      label: entry.transaction_type === "penalty" ? "Penalty" : "Quality bonus",
    })),
  ].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
  return (
    <div className="space-y-5">
      <PageHeader
        title="Incentive / Wallet"
        subtitle="Credits are added only after a case outcome is confirmed."
      />
      <section className="grid gap-3 sm:grid-cols-3">
        <Metric title="Credits" value={credits} />
        <Metric title="Value" value={`₹${(credits * 10).toFixed(2)}`} note="1 credit = ₹10" />
        <Metric title="Total earned" value={`₹${wallet.totalEarned.toFixed(2)}`} />
      </section>
      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Monthly payout summary"
      >
        <Metric title="Approved tasks this month (UTC)" value={wallet.approvedTaskCount} />
        <Metric
          title="Quality bonus this month (UTC)"
          value={`₹${wallet.qualityBonus.toFixed(2)}`}
        />
        <Metric title="Penalty this month (UTC)" value={`₹${wallet.penalty.toFixed(2)}`} />
        <Metric title="Monthly payout" value={`₹${wallet.monthlyPayout.toFixed(2)}`} />
      </section>
      <form className="surface space-y-4 p-5" onSubmit={(event) => void submit(event)}>
        <h2 className="font-semibold">Payout details</h2>
        <div className="space-y-2">
          <Label htmlFor="payout-method">Default method</Label>
          <select
            id="payout-method"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={method}
            onChange={(event) => setMethod(event.target.value as typeof method)}
          >
            <option value="upi">UPI</option>
            <option value="bank">Bank</option>
            <option value="binance">Binance Pay</option>
          </select>
        </div>
        {method === "upi" && (
          <div className="space-y-2">
            <Label htmlFor="upi-id">UPI ID</Label>
            <Input
              id="upi-id"
              value={upiId}
              onChange={(event) => setUpiId(event.target.value)}
              required
              maxLength={200}
            />
          </div>
        )}
        {method === "bank" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bank-name">Bank</Label>
              <Input
                id="bank-name"
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
                required
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank-holder">Account holder</Label>
              <Input
                id="bank-holder"
                value={bankHolder}
                onChange={(event) => setBankHolder(event.target.value)}
                required
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank-last4">Account last four digits only</Label>
              <Input
                id="bank-last4"
                value={bankLast4}
                onChange={(event) =>
                  setBankLast4(event.target.value.replace(/\D/g, "").slice(0, 4))
                }
                required
                inputMode="numeric"
                minLength={4}
                maxLength={4}
              />
            </div>
          </div>
        )}
        {method === "binance" && (
          <div className="space-y-2">
            <Label htmlFor="binance-id">Binance Pay ID</Label>
            <Input
              id="binance-id"
              value={binanceId}
              onChange={(event) => setBinanceId(event.target.value)}
              required
              maxLength={120}
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          For bank payouts, only the last four account digits are stored; do not enter a full
          account number.
        </p>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save payout details"}
        </Button>
      </form>
      <section className="surface space-y-3 p-5">
        <h2 className="font-semibold">Transaction history</h2>
        {transactions.length ? (
          transactions.map((entry) => (
            <div
              className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm"
              key={entry.id}
            >
              <span>
                {entry.label}: {entry.reason}
              </span>
              <span>
                {entry.amount < 0 ? "−" : "+"}₹{Math.abs(entry.amount).toFixed(2)}
              </span>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        )}
      </section>
    </div>
  );
}

function AdminChat({ data, refresh }: { data: StaffDashboardData; refresh: () => Promise<void> }) {
  const send = useServerFn(sendStaffAdminMessage);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await send({ data: { message } });
      setMessage("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send message.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <PageHeader title="Communication" subtitle="Admin Chat" />
      <section className="surface space-y-4 p-5">
        <h2 className="font-semibold">Admin</h2>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto">
          {data.messages.map((entry) => (
            <article
              className={`max-w-[85%] rounded-xl p-3 text-sm ${entry.sender_role === "staff" ? "ml-auto bg-primary/10" : "bg-muted"}`}
              key={entry.id}
            >
              <p className="text-xs font-semibold">
                {entry.sender_role === "staff" ? "You" : "Admin"}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{entry.message}</p>
              <time className="mt-2 block text-right text-[10px] text-muted-foreground">
                {new Date(entry.created_at).toLocaleString()}
              </time>
            </article>
          ))}
          {!data.messages.length && (
            <p className="text-sm text-muted-foreground">No Admin Chat messages yet.</p>
          )}
        </div>
        <form className="space-y-3" onSubmit={(event) => void submit(event)}>
          <Label htmlFor="admin-message">Message Admin</Label>
          <Textarea
            id="admin-message"
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={4000}
            required
          />
          <Button type="submit" disabled={busy || !message.trim()}>
            {busy ? "Sending…" : "Send to Admin"}
          </Button>
        </form>
      </section>
    </div>
  );
}

function Alerts({ data }: { data: StaffDashboardData }) {
  const pendingCases = data.cases.filter(
    (task) => !["approved", "rejected", "completed", "closed"].includes(task.status),
  );
  const caseIds = pendingCases.map((task) => task.id);
  const inactivity = useQuery({
    queryKey: ["staff-inactivity", caseIds],
    enabled: caseIds.length > 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(`Could not verify your session: ${authError.message}`);
      if (!auth.user) throw new Error("Sign in to view inactivity alerts.");
      const [communications, events] = await Promise.all([
        supabase
          .from("communication_log")
          .select("review_tracking_id,created_at")
          .eq("staff_id", auth.user.id)
          .in("review_tracking_id", caseIds)
          .throwOnError(),
        supabase
          .from("staff_case_events")
          .select("case_id,created_at")
          .in("case_id", caseIds)
          .throwOnError(),
      ]);
      return [...communications.data, ...events.data].map((item) => ({
        caseId: "review_tracking_id" in item ? item.review_tracking_id : item.case_id,
        createdAt: item.created_at,
      }));
    },
  });
  const now = Date.now();
  const inactivityDays = 7;
  const latestAssignment = data.cases.reduce<string | null>(
    (latest, task) => (!latest || task.assigned_at > latest ? task.assigned_at : latest),
    null,
  );
  const noRecentAssignment =
    !latestAssignment || now - Date.parse(latestAssignment) >= inactivityDays * 24 * 60 * 60 * 1000;
  const alerts = data.cases.flatMap((task) => {
    const items: { id: string; title: string; detail: string; at: string }[] = [];
    if (task.status === "open")
      items.push({
        id: `${task.id}-new`,
        title: "New task",
        detail: task.business_name,
        at: task.assigned_at,
      });
    if (task.deadline_at) {
      const time = Date.parse(task.deadline_at);
      if (time < now && activeStatuses.has(task.status))
        items.push({
          id: `${task.id}-overdue`,
          title: "Overdue",
          detail: task.business_name,
          at: task.deadline_at,
        });
      else if (time - now <= 24 * 60 * 60 * 1000 && activeStatuses.has(task.status))
        items.push({
          id: `${task.id}-near`,
          title: "Deadline near",
          detail: task.business_name,
          at: task.deadline_at,
        });
    }
    if (task.status === "rework")
      items.push({
        id: `${task.id}-rework`,
        title: "Rework assigned",
        detail: task.rework_instructions || task.business_name,
        at: task.updated_at,
      });
    if (["rejected", "rework"].includes(task.status))
      items.push({
        id: `${task.id}-quality`,
        title: "Low quality alert",
        detail: task.mistake_category || task.staff_decision_reason || task.business_name,
        at: task.updated_at,
      });
    return items;
  });
  if (inactivity.error)
    return <p role="alert">Could not load seven-day activity alerts: {inactivity.error.message}</p>;
  const inactiveCases = getInactiveReviews(data.cases, inactivity.data ?? [], now);
  const localHour = new Date().getHours();
  if (noRecentAssignment) {
    alerts.push({
      id: "no-recent-task",
      title: "No task since long",
      detail: latestAssignment
        ? `No task has been assigned for ${inactivityDays} days.`
        : "No task has been assigned to this staff account yet.",
      at: latestAssignment ?? new Date().toISOString(),
    });
  }
  alerts.push(
    ...data.qualityNotes.map((note) => ({
      id: note.id,
      title: note.note_type === "warning" ? "Warning note" : "Appreciation note",
      detail: note.note,
      at: note.created_at,
    })),
  );
  alerts.sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
  return (
    <div className="space-y-5">
      <PageHeader
        title="Alerts"
        subtitle="Seven-day inactivity alerts, task deadlines, rework and staff notes."
      />
      {inactivity.isPending ? (
        <p>Checking review activity…</p>
      ) : (
        <>
          <section className="surface space-y-2 border-risk-high/50 p-4">
            <h2 className="font-semibold">Daily digest · 9:00 AM local time</h2>
            <p className="text-sm text-muted-foreground">
              {localHour >= 9
                ? `${inactiveCases.length} pending review${inactiveCases.length === 1 ? "" : "s"} with no activity for seven days.`
                : "The daily digest is available at 9:00 AM local time; urgent alerts are shown below immediately."}
            </p>
          </section>
          {inactiveCases.map((task) => (
            <article
              className="surface flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-risk-high p-4"
              key={`inactive-${task.id}`}
            >
              <div>
                <p className="font-semibold text-risk-high">No activity since 7 days</p>
                <p className="mt-1 text-sm">{task.business_name}</p>
              </div>
              <Link className="text-sm text-primary underline" to="/staff/timeline">
                Open review timeline
              </Link>
            </article>
          ))}
        </>
      )}
      <h2 className="font-semibold">Notification feed</h2>
      {alerts.map((alert) => (
        <article className="surface flex flex-wrap justify-between gap-3 p-4" key={alert.id}>
          <div>
            <p className="font-semibold">{alert.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{alert.detail}</p>
          </div>
          <time className="text-xs text-muted-foreground">
            {new Date(alert.at).toLocaleString()}
          </time>
        </article>
      ))}
      {!alerts.length && (
        <p className="surface p-5 text-sm text-muted-foreground">No current alerts.</p>
      )}
    </div>
  );
}

function Profile({ data, refresh }: { data: StaffDashboardData; refresh: () => Promise<void> }) {
  const saveStatus = useServerFn(updateMyStaffLiveStatus);
  const [busy, setBusy] = useState(false);
  const staff = data.profile;
  async function changeStatus(value: string) {
    if (!["Available", "Working", "Offline"].includes(value)) return;
    setBusy(true);
    try {
      await saveStatus({ data: { live_status: value as "Available" | "Working" | "Offline" } });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update live status.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <PageHeader title="Profile" />
      <section className="surface space-y-5 p-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          {[
            ["Staff ID", staff.id],
            ["Name", staff.name],
            ["Role", staff.role],
            ["Team Lead", staff.team_lead || "Not assigned"],
            ["Skills", staff.skills.length ? staff.skills.join(", ") : "Not listed"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 break-words font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="max-w-sm space-y-2">
          <Label htmlFor="profile-live-status">Live status</Label>
          <select
            id="profile-live-status"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={staff.live_status}
            disabled={busy}
            onChange={(event) => void changeStatus(event.target.value)}
          >
            <option>Available</option>
            <option>Working</option>
            <option>Offline</option>
          </select>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Current location</p>
          <p className="mt-1 font-medium">{data.ipLocation || "IP-based location unavailable"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.ipLocation
              ? "Approximate location from trusted hosting request headers; not used for access control."
              : `Registered region: ${staff.region_city}, ${staff.region_state}.`}
          </p>
        </div>
      </section>
    </div>
  );
}

export function StaffApprovalScreen({
  status,
  rejectReason,
  notice,
}: {
  status: string;
  rejectReason?: string | null;
  notice?: string | null;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const rejected = status === "rejected" || status === "disabled";
  async function logout() {
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setBusy(false);
      toast.error(`Could not log out: ${error.message}`);
      return;
    }
    await navigate({ to: "/auth", replace: true });
  }
  return (
    <main className="grid min-h-screen place-items-center bg-background p-5">
      <section className="surface w-full max-w-lg space-y-4 p-6 text-center sm:p-8">
        <h1 className="text-2xl font-bold">
          {rejected ? "Access Denied" : "Pending Superadmin Approval"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {rejected
            ? "Your staff dashboard access is not approved. Contact the superadmin for assistance."
            : "Your staff registration is awaiting superadmin approval. Dashboard modules will be available after approval."}
        </p>
        {rejected && rejectReason && (
          <p className="rounded-lg border border-risk-high/30 bg-risk-high-soft p-3 text-sm">
            Reason: {rejectReason.replaceAll("_", " ")}
          </p>
        )}
        {notice && <p className="rounded-lg border p-3 text-sm">{notice}</p>}
        <Button onClick={() => void logout()} disabled={busy}>
          {busy ? "Logging out…" : "Logout"}
        </Button>
      </section>
    </main>
  );
}

export function StaffDashboardPage({ module }: { module: DashboardModule }) {
  const queryClient = useQueryClient();
  const dashboard = useQuery({
    queryKey: dashboardKey,
    queryFn: useServerFn(getStaffDashboard),
    refetchInterval: module === "communication" ? 10_000 : false,
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: dashboardKey });
  };
  if (dashboard.isLoading) return <p>Loading staff dashboard…</p>;
  if (dashboard.error || !dashboard.data)
    return <p role="alert">{dashboard.error?.message ?? "Could not load your staff dashboard."}</p>;

  switch (module) {
    case "overview":
      return <Overview data={dashboard.data} />;
    case "tasks":
      return <MyTasks data={dashboard.data} refresh={refresh} />;
    case "status-board":
      return <StatusBoard data={dashboard.data} />;
    case "performance":
      return <Performance data={dashboard.data} />;
    case "quality":
      return <Quality data={dashboard.data} />;
    case "incentive":
      return <Incentive data={dashboard.data} refresh={refresh} />;
    case "communication":
      return <AdminChat data={dashboard.data} refresh={refresh} />;
    case "alerts":
      return <Alerts data={dashboard.data} />;
    case "profile":
      return <Profile data={dashboard.data} refresh={refresh} />;
  }
}
