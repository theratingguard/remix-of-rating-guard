import { useMemo, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/app-shell";
import {
  analyzeStaffReply,
  assignStaffCases,
  closeStaffCase,
  getAdminStaffData,
  getClientStaffCases,
  getStaffWorkspace,
  recordStaffNextAction,
  recordStaffSubmission,
  registerStaff,
  setStaffStatus,
  updateMyStaffProfile,
  type StaffProfileInput,
} from "@/lib/staff-case.functions";

const staffKey = ["staff-workspace"];
const adminStaffKey = ["admin-staff-cases"];
const emptyStaff: StaffProfileInput = { name: "", mobile: "", region_city: "", region_state: "" };

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-900",
    open: "bg-amber-100 text-amber-900",
    submitted: "bg-orange-100 text-orange-900",
    reply_received: "bg-sky-100 text-sky-900",
    closed: "bg-emerald-100 text-emerald-900",
    active: "bg-emerald-100 text-emerald-900",
    disabled: "bg-red-100 text-red-900",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${colors[status] ?? "bg-muted"}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function StaffFields({
  value,
  onChange,
  email,
  disabled = false,
}: {
  value: StaffProfileInput;
  onChange: (next: StaffProfileInput) => void;
  email: string;
  disabled?: boolean;
}) {
  const fields: { key: keyof StaffProfileInput; label: string; type?: string }[] = [
    { key: "name", label: "Name" },
    { key: "mobile", label: "Mobile", type: "tel" },
    { key: "region_city", label: "City" },
    { key: "region_state", label: "State / region" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <div className="space-y-2" key={field.key}>
          <Label htmlFor={`staff-${field.key}`}>{field.label}</Label>
          <Input
            id={`staff-${field.key}`}
            type={field.type ?? "text"}
            required
            maxLength={120}
            value={value[field.key]}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
          />
        </div>
      ))}
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="staff-email">Signed-in account email</Label>
        <Input id="staff-email" value={email} readOnly disabled />
        <p className="text-xs text-muted-foreground">
          This profile uses the existing Rating Guard sign-in; no separate login code is created.
        </p>
      </div>
    </div>
  );
}

export function StaffRegisterPage({ email }: { email: string }) {
  const [value, setValue] = useState(emptyStaff);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = useServerFn(registerStaff);
  const queryClient = useQueryClient();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await save({ data: value });
      setStatus(result.status);
      await queryClient.invalidateQueries({ queryKey: ["my-staff-profile"] });
      toast.success("Staff registration saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Staff registration failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title="Staff registration"
        subtitle="Register your internal case-handler profile using your existing account."
      />
      {status && (
        <section className="surface p-4" role="status">
          <p className="font-semibold">Status: {status}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {status === "active"
              ? "Your case-handler access is active."
              : "An administrator must approve your registration before case access."}
          </p>
        </section>
      )}
      <form className="surface space-y-5 p-5 sm:p-6" onSubmit={submit}>
        <StaffFields value={value} onChange={setValue} email={email} disabled={busy} />
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Submit registration"}
        </Button>
      </form>
    </main>
  );
}

export function StaffLoginPage() {
  return (
    <main className="mx-auto max-w-lg space-y-4">
      <PageHeader title="Staff sign-in" subtitle="Use your existing Rating Guard account." />
      <section className="surface space-y-3 p-5">
        <p className="text-sm">
          Staff do not use a separate mobile/code login. Sign-in remains managed by the existing
          account authentication.
        </p>
        <Button asChild>
          <Link to="/auth">Continue to sign in</Link>
        </Button>
      </section>
    </main>
  );
}

export function StaffProfilePage() {
  const queryClient = useQueryClient();
  const workspace = useQuery({ queryKey: staffKey, queryFn: useServerFn(getStaffWorkspace) });
  const save = useServerFn(updateMyStaffProfile);
  const [form, setForm] = useState<StaffProfileInput | null>(null);
  const [busy, setBusy] = useState(false);
  const staff = workspace.data?.profile;
  const value =
    form ??
    (staff
      ? {
          name: staff.name,
          mobile: staff.mobile,
          region_city: staff.region_city,
          region_state: staff.region_state,
        }
      : emptyStaff);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await save({ data: value });
      await queryClient.invalidateQueries({ queryKey: staffKey });
      setForm(null);
      toast.success("Staff profile updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update staff profile.");
    } finally {
      setBusy(false);
    }
  }
  if (workspace.isLoading) return <p>Loading profile…</p>;
  if (workspace.error || !staff)
    return <p role="alert">{workspace.error?.message ?? "Active staff profile not found."}</p>;
  return (
    <main className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Staff profile" subtitle={`Access status: ${staff.status}`} />
      <form className="surface space-y-5 p-5" onSubmit={submit}>
        <StaffFields value={value} onChange={setForm} email={staff.email} disabled={busy} />
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </main>
  );
}

export function StaffCasesPage() {
  const queryClient = useQueryClient();
  const workspace = useQuery({ queryKey: staffKey, queryFn: useServerFn(getStaffWorkspace) });
  const submitCase = useServerFn(recordStaffSubmission);
  const analyze = useServerFn(analyzeStaffReply);
  const recordNextAction = useServerFn(recordStaffNextAction);
  const [replyById, setReplyById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [analysisById, setAnalysisById] = useState<
    Record<
      string,
      { status: string; next_step: string; reasoning: string; suggested_angle: string | null }
    >
  >({});
  async function copyReport(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Draft copied. Check every quote and claim before submission.");
    } catch (error) {
      console.error("[staff-cases] Copy failed", error);
      toast.error("Could not copy; select and copy the draft manually.");
    }
  }
  async function recordSubmission(caseId: string) {
    if (
      !window.confirm("Did you personally submit this request through Google's official channel?")
    )
      return;
    setBusyId(caseId);
    try {
      await submitCase({ data: { caseId, confirmed: true } });
      await queryClient.invalidateQueries({ queryKey: staffKey });
      toast.success("Manual submission recorded; Google has not independently verified it.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record submission.");
    } finally {
      setBusyId(null);
    }
  }
  async function analyzeReply(caseId: string) {
    setBusyId(caseId);
    try {
      const result = await analyze({ data: { caseId, reply: replyById[caseId] ?? "" } });
      setAnalysisById((current) => ({ ...current, [caseId]: result }));
      await queryClient.invalidateQueries({ queryKey: staffKey });
      toast.success("Reply analyzed. Verify status with Google's actual response.");
    } catch (error) {
      await queryClient.invalidateQueries({ queryKey: staffKey });
      toast.error(error instanceof Error ? error.message : "Reply analysis failed.");
    } finally {
      setBusyId(null);
    }
  }
  async function completeNextAction(caseId: string) {
    if (!window.confirm("Have you completed the suggested next action for this case?")) return;
    setBusyId(caseId);
    try {
      await recordNextAction({ data: { caseId } });
      await queryClient.invalidateQueries({ queryKey: staffKey });
      toast.success("Next action recorded in the work log.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record the next action.");
    } finally {
      setBusyId(null);
    }
  }
  if (workspace.isLoading) return <p>Loading staff cases…</p>;
  if (workspace.error || !workspace.data)
    return (
      <main className="mx-auto max-w-2xl space-y-4">
        <PageHeader title="Staff cases" />
        <div className="surface space-y-3 p-5" role="alert">
          <p>{workspace.error?.message ?? "Could not load staff cases."}</p>
          <Link className="underline" to="/staff/register">
            Register or update staff profile
          </Link>
        </div>
      </main>
    );
  const { profile, cases, events, stats } = workspace.data;
  return (
    <main className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title={`Hi ${profile.name}`}
        subtitle={`${profile.region_city}, ${profile.region_state}`}
        action={
          <Link className="text-sm underline" to="/staff/profile">
            Staff profile
          </Link>
        }
      />
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Today", stats.today],
          ["This week", stats.thisWeek],
          ["Open", stats.open],
          ["Submitted", stats.submitted],
          ["Reply received", stats.replyReceived],
          ["Closed", stats.closed],
        ].map(([label, count]) => (
          <div className="surface p-3" key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-bold">{count}</p>
          </div>
        ))}
      </section>
      {!cases.length ? (
        <section className="surface p-6 text-sm text-muted-foreground">
          No cases have been assigned.
        </section>
      ) : (
        cases.map((caseItem) => {
          const analysis = analysisById[caseItem.id];
          const evidenceReady = !caseItem.evidence_notes.startsWith("No exact");
          return (
            <article className="surface space-y-4 p-4 sm:p-6" key={caseItem.id}>
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Case</p>
                  <h2 className="text-lg font-bold">{caseItem.business_name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {caseItem.business_region || "Business region unavailable"}
                  </p>
                </div>
                <StatusPill status={caseItem.status} />
              </header>
              <div className="rounded-lg border p-3">
                <p className="text-xs font-semibold text-muted-foreground">SOURCE REVIEW</p>
                <p className="mt-2 whitespace-pre-wrap text-sm">
                  {caseItem.review_text || "Review text unavailable."}
                </p>
              </div>
              <p className="text-sm">
                <span className="font-semibold">Policy area:</span>{" "}
                {caseItem.policy_angle || "Review required"} ·{" "}
                <span className="font-semibold">Evidence:</span>{" "}
                {evidenceReady ? "quote available—verify" : "needs review"}
              </p>
              <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 font-sans text-sm">
                {caseItem.report_text}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copyReport(caseItem.report_text)}
                >
                  Copy report
                </Button>
                <a
                  className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-accent"
                  href={caseItem.review_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Google Maps review
                </a>
                {caseItem.status === "open" && (
                  <Button
                    type="button"
                    disabled={busyId === caseItem.id}
                    onClick={() => void recordSubmission(caseItem.id)}
                  >
                    {busyId === caseItem.id ? "Saving…" : "Record manual submission"}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                No Google form URL is assumed; use the exact review link and the approved official
                reporting channel. The app does not submit requests.
              </p>
              <div className="space-y-2">
                <Label htmlFor={`staff-reply-${caseItem.id}`}>Paste the actual Google reply</Label>
                <Textarea
                  id={`staff-reply-${caseItem.id}`}
                  rows={3}
                  maxLength={5000}
                  value={replyById[caseItem.id] ?? caseItem.google_reply ?? ""}
                  onChange={(event) =>
                    setReplyById((current) => ({ ...current, [caseItem.id]: event.target.value }))
                  }
                  placeholder="Paste the received reply without editing…"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    busyId === caseItem.id ||
                    (replyById[caseItem.id] ?? caseItem.google_reply ?? "").trim().length < 3
                  }
                  onClick={() => void analyzeReply(caseItem.id)}
                >
                  {busyId === caseItem.id ? "Analyzing…" : "Analyze reply"}
                </Button>
                {(analysis || caseItem.ai_status) && (
                  <div className="rounded-lg border p-3 text-sm" aria-live="polite">
                    <p>
                      <span className="font-semibold">Advisory status:</span>{" "}
                      {analysis?.status ?? caseItem.ai_status} · not verified
                    </p>
                    <p className="mt-1">{analysis?.next_step ?? caseItem.ai_next_step}</p>
                    {(analysis?.suggested_angle ?? caseItem.suggested_angle) && (
                      <p className="mt-1">
                        <span className="font-semibold">Possible next angle:</span>{" "}
                        {analysis?.suggested_angle ?? caseItem.suggested_angle}
                      </p>
                    )}
                    {analysis && <p className="mt-1 text-muted-foreground">{analysis.reasoning}</p>}
                    {(analysis?.next_step || caseItem.ai_next_step) &&
                      caseItem.status !== "closed" && (
                        <Button
                          className="mt-3"
                          type="button"
                          variant="outline"
                          disabled={busyId === caseItem.id}
                          onClick={() => void completeNextAction(caseItem.id)}
                        >
                          Record next action completed
                        </Button>
                      )}
                  </div>
                )}
              </div>
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  Case work log ({events.filter((event) => event.case_id === caseItem.id).length})
                </summary>
                <ol className="mt-3 space-y-2">
                  {events
                    .filter((event) => event.case_id === caseItem.id)
                    .map((event) => (
                      <li className="border-l-2 pl-3 text-xs" key={event.id}>
                        <p className="font-medium">{event.event_type.replaceAll("_", " ")}</p>
                        <time className="text-muted-foreground">
                          {new Date(event.created_at).toLocaleString()}
                        </time>
                      </li>
                    ))}
                </ol>
              </details>
            </article>
          );
        })
      )}
    </main>
  );
}

export function AdminCaseAssignmentPage() {
  const queryClient = useQueryClient();
  const adminData = useQuery({ queryKey: adminStaffKey, queryFn: useServerFn(getAdminStaffData) });
  const assign = useServerFn(assignStaffCases);
  const [staffId, setStaffId] = useState("");
  const [pastedUrls, setPastedUrls] = useState("");
  const [busy, setBusy] = useState(false);
  const urls = pastedUrls
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean);
  const matched = useMemo(() => {
    if (!adminData.data) return [];
    const pasted = pastedUrls
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean);
    const available = new Map(
      adminData.data.candidates.map((candidate) => [candidate.review_url, candidate]),
    );
    const used = new Set<string>();
    return pasted.map((url) => {
      const candidate = available.get(url);
      const key = candidate ? `${candidate.scan_id}:${candidate.review_id}` : url;
      if (!candidate || used.has(key)) return { url, candidate: null };
      used.add(key);
      return { url, candidate };
    });
  }, [adminData.data, pastedUrls]);
  const eligible = matched.flatMap((entry) =>
    entry.candidate
      ? [{ scanId: entry.candidate.scan_id, reviewId: entry.candidate.review_id }]
      : [],
  );
  async function submit() {
    if (!staffId || eligible.length === 0) return;
    setBusy(true);
    try {
      const result = await assign({ data: { staffId, targets: eligible } });
      toast.success(
        `${result.assignedCount} case${result.assignedCount === 1 ? "" : "s"} assigned.`,
      );
      setPastedUrls("");
      await queryClient.invalidateQueries({ queryKey: adminStaffKey });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Case assignment failed.");
    } finally {
      setBusy(false);
    }
  }
  if (adminData.isLoading) return <p>Loading assignments…</p>;
  if (adminData.error || !adminData.data)
    return <p role="alert">{adminData.error?.message ?? "Could not load assignment data."}</p>;
  const activeStaff = adminData.data.staff.filter((row) => row.status === "active");
  const orderedStaff = [...activeStaff].sort((left, right) => {
    const locationScore = (person: (typeof activeStaff)[number]) =>
      eligible.reduce((total, target) => {
        const candidate = adminData.data.candidates.find(
          (row) => row.scan_id === target.scanId && row.review_id === target.reviewId,
        );
        const region = candidate?.business_region.toLocaleLowerCase() ?? "";
        const cityMatches = region.includes(person.region_city.trim().toLocaleLowerCase());
        const stateMatches = region.includes(person.region_state.trim().toLocaleLowerCase());
        return total + (cityMatches ? 2 : stateMatches ? 1 : 0);
      }, 0);
    return locationScore(right) - locationScore(left);
  });
  return (
    <main className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Client case assignment"
        subtitle="Paste exact review URLs from completed scans. Multiple eligible URLs can be assigned as one batch (up to 20)."
      />
      <section className="surface space-y-4 p-4 sm:p-6">
        <div className="space-y-2">
          <Label htmlFor="staff-review-urls">Review URL(s), one per line</Label>
          <Textarea
            id="staff-review-urls"
            rows={6}
            placeholder="Paste exact Google Maps review URLs from completed client scans…"
            value={pastedUrls}
            maxLength={12000}
            onChange={(event) => setPastedUrls(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Only exact URLs tied to eligible completed client scans are assignable. An unmatched URL
            will not be assigned.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-assignee">Active staff member</Label>
          <select
            id="staff-assignee"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={staffId}
            onChange={(event) => setStaffId(event.target.value)}
          >
            <option value="">Select staff…</option>
            {orderedStaff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} · {person.region_city}, {person.region_state}
              </option>
            ))}
          </select>
        </div>
        {!!urls.length && (
          <section className="space-y-2 rounded-lg border p-3" aria-live="polite">
            <h2 className="text-sm font-semibold">URL validation</h2>
            {matched.map((entry) => (
              <div className="flex flex-wrap justify-between gap-2 text-xs" key={entry.url}>
                <span className="max-w-full break-all">{entry.url}</span>
                <span
                  className={
                    entry.candidate
                      ? "font-semibold text-emerald-700"
                      : "font-semibold text-amber-800"
                  }
                >
                  {entry.candidate
                    ? `${entry.candidate.business_name} · eligible`
                    : "No exact eligible match"}
                </span>
              </div>
            ))}
          </section>
        )}
        <p className="text-xs text-muted-foreground">
          Business region is taken from the address captured during the client scan; confirm it
          before assigning. Staff region is a routing convenience only.
        </p>
        <Button
          disabled={!staffId || !eligible.length || busy || eligible.length > 20}
          onClick={() => void submit()}
        >
          {busy
            ? "Assigning…"
            : `Assign ${eligible.length} eligible case${eligible.length === 1 ? "" : "s"}`}
        </Button>
      </section>
      <p>
        <Link className="text-sm underline" to="/admin/staff">
          Manage staff registrations
        </Link>
      </p>
    </main>
  );
}

export function AdminStaffPage() {
  const queryClient = useQueryClient();
  const result = useQuery({ queryKey: adminStaffKey, queryFn: useServerFn(getAdminStaffData) });
  const setStatus = useServerFn(setStaffStatus);
  const [busyId, setBusyId] = useState<string | null>(null);
  async function updateStatus(id: string, status: "active" | "disabled") {
    setBusyId(id);
    try {
      await setStatus({ data: { staffId: id, status } });
      await queryClient.invalidateQueries({ queryKey: adminStaffKey });
      toast.success(`Staff ${status}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update staff.");
    } finally {
      setBusyId(null);
    }
  }
  if (result.isLoading) return <p>Loading staff dashboard…</p>;
  if (result.error || !result.data)
    return <p role="alert">{result.error?.message ?? "Could not load staff."}</p>;
  const { staff, cases, stats } = result.data;
  return (
    <main className="space-y-6">
      <PageHeader
        title="Case handler staff"
        subtitle="Manage access and case workload."
        action={
          <Link className="text-sm underline" to="/admin/case-assignment">
            Assign cases
          </Link>
        }
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Total staff", stats.totalStaff],
          ["Active today", stats.activeToday],
          ["Cases assigned", stats.casesAssigned],
          ["Cases submitted", stats.casesSubmitted],
          ["Cases closed", stats.casesClosed],
          [
            "Avg. handling",
            stats.meanHandlingHours == null ? "—" : `${stats.meanHandlingHours.toFixed(1)} h`,
          ],
        ].map(([label, value]) => (
          <div className="surface p-4" key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </section>
      <section className="surface overflow-x-auto p-4 sm:p-6">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-2">Staff</th>
              <th>Region</th>
              <th>Cases</th>
              <th>Status</th>
              <th>Last active</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((person) => (
              <tr className="border-b" key={person.id}>
                <td className="p-2">
                  <Link className="underline" to="/admin/staff/$id" params={{ id: person.id }}>
                    {person.name}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{person.email}</span>
                </td>
                <td>
                  {person.region_city}, {person.region_state}
                </td>
                <td>{cases.filter((item) => item.staff_id === person.id).length}</td>
                <td>
                  <StatusPill status={person.status} />
                </td>
                <td>
                  {person.last_seen_at ? new Date(person.last_seen_at).toLocaleString() : "—"}
                </td>
                <td>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === person.id}
                    onClick={() =>
                      void updateStatus(
                        person.id,
                        person.status === "active" ? "disabled" : "active",
                      )
                    }
                  >
                    {person.status === "active" ? "Disable" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p>
        <Link className="text-sm underline" to="/admin/cases">
          Open all cases
        </Link>
      </p>
    </main>
  );
}

export function AdminCasesPage() {
  const queryClient = useQueryClient();
  const result = useQuery({ queryKey: adminStaffKey, queryFn: useServerFn(getAdminStaffData) });
  const close = useServerFn(closeStaffCase);
  const [busyId, setBusyId] = useState<string | null>(null);
  async function closeCase(caseId: string) {
    if (!window.confirm("Close this internal case? This does not assert any removal outcome."))
      return;
    setBusyId(caseId);
    try {
      await close({ data: { caseId } });
      await queryClient.invalidateQueries({ queryKey: adminStaffKey });
      toast.success("Case closed and work log updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not close the case.");
    } finally {
      setBusyId(null);
    }
  }
  if (result.isLoading) return <p>Loading case list…</p>;
  if (result.error || !result.data)
    return <p role="alert">{result.error?.message ?? "Could not load cases."}</p>;
  return (
    <main className="space-y-5">
      <PageHeader
        title="All staff cases"
        action={
          <Link className="text-sm underline" to="/admin/case-assignment">
            Assign case
          </Link>
        }
      />
      <section className="surface overflow-x-auto p-4">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-2">Business</th>
              <th>Staff</th>
              <th>Status</th>
              <th>Policy area</th>
              <th>Assigned</th>
              <th>Work log</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {result.data.cases.map((item) => (
              <tr className="border-b" key={item.id}>
                <td className="p-2">
                  {item.business_name}
                  <span className="block text-xs text-muted-foreground">
                    {item.business_region}
                  </span>
                </td>
                <td>
                  {result.data.staff.find((person) => person.id === item.staff_id)?.name ??
                    "Unknown"}
                </td>
                <td>
                  <StatusPill status={item.status} />
                </td>
                <td>{item.policy_angle || "—"}</td>
                <td>{new Date(item.assigned_at).toLocaleDateString()}</td>
                <td>
                  <details>
                    <summary className="cursor-pointer underline">
                      {result.data.events.filter((event) => event.case_id === item.id).length}{" "}
                      events
                    </summary>
                    <ol className="min-w-48 space-y-2 py-2">
                      {result.data.events
                        .filter((event) => event.case_id === item.id)
                        .map((event) => (
                          <li className="border-l-2 pl-2 text-xs" key={event.id}>
                            <p className="font-medium">{event.event_type.replaceAll("_", " ")}</p>
                            <time className="text-muted-foreground">
                              {new Date(event.created_at).toLocaleString()}
                            </time>
                          </li>
                        ))}
                    </ol>
                  </details>
                </td>
                <td>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={item.status === "closed" || busyId === item.id}
                    onClick={() => void closeCase(item.id)}
                  >
                    {item.status === "closed" ? "Closed" : "Close case"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

export function AdminStaffDetailPage({ id }: { id: string }) {
  const result = useQuery({ queryKey: adminStaffKey, queryFn: useServerFn(getAdminStaffData) });
  if (result.isLoading) return <p>Loading staff record…</p>;
  if (result.error || !result.data)
    return <p role="alert">{result.error?.message ?? "Could not load staff."}</p>;
  const person = result.data.staff.find((row) => row.id === id);
  if (!person) return <p role="alert">Staff member not found.</p>;
  const cases = result.data.cases.filter((row) => row.staff_id === id);
  return (
    <main className="space-y-5">
      <PageHeader
        title={person.name}
        subtitle={`${person.region_city}, ${person.region_state} · ${person.email}`}
        action={
          <Link className="text-sm underline" to="/admin/staff">
            All staff
          </Link>
        }
      />
      <section className="surface grid gap-3 p-5 sm:grid-cols-3">
        <p>Mobile: {person.mobile}</p>
        <p>Status: {person.status}</p>
        <p>Cases: {cases.length}</p>
      </section>
      <section className="surface space-y-3 p-5">
        <h2 className="font-bold">Assigned cases</h2>
        {cases.map((item) => (
          <article className="rounded-lg border p-3" key={item.id}>
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-semibold">{item.business_name}</p>
              <StatusPill status={item.status} />
            </div>
            <p className="mt-1 text-sm">{item.policy_angle || "Evidence review"}</p>
            <a
              className="mt-2 inline-block text-sm underline"
              href={item.review_url}
              target="_blank"
              rel="noreferrer"
            >
              Open source review
            </a>
          </article>
        ))}
      </section>
    </main>
  );
}

export function ClientStaffWorkLog({ scanId }: { scanId: string }) {
  const load = useServerFn(getClientStaffCases);
  const result = useQuery({
    queryKey: ["client-staff-case-log", scanId],
    queryFn: () => load({ data: { scanId } }),
  });
  if (result.isLoading)
    return <p className="mt-4 text-sm text-muted-foreground">Loading case-handler work log…</p>;
  if (result.error)
    return (
      <p className="mt-4 text-sm" role="alert">
        Could not load case-handler log: {result.error.message}
      </p>
    );
  const cases = result.data?.cases ?? [];
  const events = result.data?.events ?? [];
  if (!cases.length) return null;
  const names: Record<string, string> = {
    client_reported: "Client review report received",
    case_assigned: "Case assigned to authorized staff",
    report_prepared: "Evidence-based draft prepared",
    submission_recorded: "Manual submission recorded",
    reply_received: "Google reply recorded",
    reply_analyzed: "Reply analyzed (advisory)",
    next_action_taken: "Next action recorded",
    case_closed: "Case closed",
  };
  return (
    <section className="mt-6 space-y-4 border-t pt-5" aria-label="Case handler work log">
      <h3 className="font-semibold">Case handler work log</h3>
      {cases.map((item) => (
        <article className="rounded-lg border p-3" key={item.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              {item.business_name} · {item.policy_angle}
            </p>
            <StatusPill status={item.status} />
          </div>
          {item.ai_status && (
            <p className="mt-1 text-xs text-muted-foreground">
              Advisory response status: {item.ai_status}; not verified. {item.ai_next_step}
            </p>
          )}
          <ol className="mt-3 space-y-2">
            {events
              .filter((event) => event.case_id === item.id)
              .map((event) => (
                <li className="border-l-2 pl-3 text-xs" key={event.id}>
                  <p className="font-medium">{names[event.event_type] ?? "Case activity"}</p>
                  <time className="text-muted-foreground">
                    {new Date(event.created_at).toLocaleString()}
                  </time>
                </li>
              ))}
          </ol>
        </article>
      ))}
      <p className="text-xs text-muted-foreground">
        Submission records are staff-reported. Google decisions are not independently verified by
        this app.
      </p>
    </section>
  );
}
