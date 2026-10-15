import { useMemo, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  analyzeInvestigatorReply,
  assignInvestigatorCase,
  closeInvestigatorCase,
  getAdminInvestigatorData,
  getClientInvestigatorCases,
  getInvestigatorWorkspace,
  registerInvestigator,
  recordInvestigatorSubmission,
  setInvestigatorStatus,
  updateInvestigatorProfile,
  type InvestigatorProfileInput,
} from "@/lib/investigator.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/app-shell";

const workspaceKey = ["investigator-workspace"];
const adminDataKey = ["admin-investigators"];
const emptyProfile: InvestigatorProfileInput = {
  name: "",
  mobile: "",
  city: "",
  state: "",
  pincode: "",
};

function CaseStatus({ status }: { status: string }) {
  const style: Record<string, string> = {
    assigned: "bg-amber-100 text-amber-900",
    pending: "bg-amber-100 text-amber-900",
    submitted: "bg-orange-100 text-orange-900",
    reviewed: "bg-sky-100 text-sky-900",
    closed: "bg-emerald-100 text-emerald-900",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${style[status] ?? "bg-muted"}`}
    >
      {status}
    </span>
  );
}

function ProfileFields({
  value,
  onChange,
  email,
  disabled,
}: {
  value: InvestigatorProfileInput;
  onChange: (next: InvestigatorProfileInput) => void;
  email: string;
  disabled?: boolean;
}) {
  const fields: { key: keyof InvestigatorProfileInput; label: string; type?: string }[] = [
    { key: "name", label: "Name" },
    { key: "mobile", label: "Mobile number", type: "tel" },
    { key: "city", label: "City" },
    { key: "state", label: "State" },
    { key: "pincode", label: "Pincode" },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <div className="space-y-2" key={field.key}>
          <Label htmlFor={`investigator-${field.key}`}>{field.label}</Label>
          <Input
            id={`investigator-${field.key}`}
            type={field.type ?? "text"}
            required
            maxLength={field.key === "mobile" ? 32 : 120}
            value={value[field.key]}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
          />
        </div>
      ))}
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="investigator-email">Account email</Label>
        <Input id="investigator-email" value={email} disabled readOnly />
        <p className="text-xs text-muted-foreground">
          Email comes from your signed-in account and cannot be changed here.
        </p>
      </div>
    </div>
  );
}

export function InvestigatorRegisterPage({ email }: { email: string }) {
  const queryClient = useQueryClient();
  const register = useServerFn(registerInvestigator);
  const [form, setForm] = useState(emptyProfile);
  const [savedStatus, setSavedStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await register({ data: form });
      setSavedStatus(result.status);
      await queryClient.invalidateQueries({ queryKey: ["investigator-profile"] });
      toast.success(
        result.status === "active"
          ? "Investigator profile saved."
          : "Registration saved; an administrator must activate access.",
      );
    } catch (submitError) {
      toast.error(
        submitError instanceof Error ? submitError.message : "Registration could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title="Investigator registration"
        subtitle="Internal staff access uses your existing Rating Guard sign-in."
      />
      {savedStatus && (
        <div className="surface p-4" role="status">
          <p className="font-semibold">Profile status: {savedStatus}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {savedStatus === "active"
              ? "Your investigator access is active."
              : "Registration is pending administrator approval. No separate login code is issued."}
          </p>
          {savedStatus === "active" && (
            <Link className="mt-3 inline-block underline" to="/investigator/cases">
              Open assigned cases
            </Link>
          )}
        </div>
      )}
      <form className="surface space-y-5 p-5 sm:p-6" onSubmit={submit}>
        <ProfileFields value={form} onChange={setForm} email={email} disabled={busy} />
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Submit registration"}
        </Button>
      </form>
    </main>
  );
}

export function InvestigatorProfilePage() {
  const queryClient = useQueryClient();
  const workspace = useQuery({
    queryKey: workspaceKey,
    queryFn: useServerFn(getInvestigatorWorkspace),
  });
  const save = useServerFn(updateInvestigatorProfile);
  const profile = workspace.data?.profile;
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<InvestigatorProfileInput | null>(null);
  const currentForm =
    form ??
    (profile
      ? {
          name: profile.name,
          mobile: profile.mobile,
          city: profile.city,
          state: profile.state,
          pincode: profile.pincode,
        }
      : emptyProfile);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await save({ data: currentForm });
      await queryClient.invalidateQueries({ queryKey: workspaceKey });
      toast.success("Profile updated.");
      setForm(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Profile update failed.");
    } finally {
      setBusy(false);
    }
  }
  if (workspace.isLoading) return <p>Loading profile…</p>;
  if (workspace.error || !profile)
    return (
      <p role="alert">{workspace.error?.message ?? "Active investigator profile not found."}</p>
    );
  return (
    <main className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Investigator profile" subtitle={`Access: ${profile.status}`} />
      <form className="surface space-y-5 p-5 sm:p-6" onSubmit={submit}>
        <ProfileFields
          value={currentForm}
          email={profile.email}
          onChange={setForm}
          disabled={busy}
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </main>
  );
}

export function InvestigatorCasesPage() {
  const queryClient = useQueryClient();
  const workspace = useQuery({
    queryKey: workspaceKey,
    queryFn: useServerFn(getInvestigatorWorkspace),
  });
  const submitCase = useServerFn(recordInvestigatorSubmission);
  const analyze = useServerFn(analyzeInvestigatorReply);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [busyCase, setBusyCase] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<
    Record<string, { status: string; next_step: string; reasoning: string }>
  >({});

  async function copyReport(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Draft copied. Verify every fact and quote before use.");
    } catch (error) {
      console.error("[investigator] Clipboard copy failed", error);
      toast.error("Could not copy the draft. Select and copy it manually.");
    }
  }
  async function recordSubmission(caseId: string) {
    if (!window.confirm("Did you personally submit this draft through Google's official channel?"))
      return;
    setBusyCase(caseId);
    try {
      await submitCase({ data: { caseId, confirmed: true } });
      await queryClient.invalidateQueries({ queryKey: workspaceKey });
      toast.success("Manual submission recorded. Google has not independently verified it.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Submission could not be recorded.");
    } finally {
      setBusyCase(null);
    }
  }
  async function analyzeReply(caseId: string) {
    const reply = replies[caseId]?.trim() ?? "";
    setBusyCase(caseId);
    try {
      const result = await analyze({ data: { caseId, reply } });
      setAnalysis((current) => ({ ...current, [caseId]: result }));
      await queryClient.invalidateQueries({ queryKey: workspaceKey });
      toast.success("Reply analyzed locally; verify the actual status in Google.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reply analysis failed.");
    } finally {
      setBusyCase(null);
    }
  }
  if (workspace.isLoading) return <p>Loading assigned cases…</p>;
  if (workspace.error || !workspace.data)
    return (
      <main className="mx-auto max-w-2xl space-y-4">
        <PageHeader title="Investigator cases" />
        <div className="surface space-y-3 p-5" role="alert">
          <p>{workspace.error?.message ?? "Could not load investigator workspace."}</p>
          <Link className="underline" to="/investigator/register">
            Register or update your investigator profile
          </Link>
        </div>
      </main>
    );
  const { profile, cases, events } = workspace.data;
  const openCount = cases.filter((item) => item.status !== "closed").length;
  return (
    <main className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title={`Hi ${profile.name}`}
        subtitle={`${openCount} open case${openCount === 1 ? "" : "s"} · ${profile.city}, ${profile.state}`}
        action={
          <Link className="text-sm underline" to="/investigator/profile">
            Edit profile
          </Link>
        }
      />
      {cases.length === 0 ? (
        <section className="surface p-6 text-sm text-muted-foreground">
          No cases are assigned to you yet.
        </section>
      ) : (
        cases.map((caseItem) => {
          const caseEvents = events.filter((event) => event.case_id === caseItem.id);
          const replyAnalysis = analysis[caseItem.id];
          const evidenceReady = !caseItem.evidence_notes.startsWith("No exact");
          return (
            <article className="surface space-y-4 p-4 sm:p-6" key={caseItem.id}>
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Case
                  </p>
                  <h2 className="text-lg font-bold">{caseItem.business_name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {[caseItem.business_city, caseItem.business_state].filter(Boolean).join(", ") ||
                      "Location not recorded"}
                  </p>
                </div>
                <CaseStatus status={caseItem.status} />
              </header>
              <div className="rounded-lg border p-3">
                <p className="text-xs font-semibold text-muted-foreground">SOURCE REVIEW</p>
                <p className="mt-2 whitespace-pre-wrap text-sm">
                  {caseItem.review_text || "Review text unavailable."}
                </p>
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <p>
                  <span className="font-semibold">Evidence prepared:</span>{" "}
                  {evidenceReady ? "Yes — verify against source" : "No — evidence review required"}
                </p>
                <p>
                  <span className="font-semibold">Policy concern:</span>{" "}
                  {caseItem.policy_angle || "Needs review"}
                </p>
              </div>
              <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">
                {caseItem.report_text}
              </p>
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
                {caseItem.status === "assigned" || caseItem.status === "pending" ? (
                  <Button
                    type="button"
                    disabled={busyCase === caseItem.id}
                    onClick={() => void recordSubmission(caseItem.id)}
                  >
                    {busyCase === caseItem.id ? "Saving…" : "Record manual submission"}
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                This is a draft for an authorized representative to review. The app does not submit
                to Google or fabricate a form URL.
              </p>
              <div className="space-y-2">
                <Label htmlFor={`reply-${caseItem.id}`}>Paste Google’s actual reply</Label>
                <Textarea
                  id={`reply-${caseItem.id}`}
                  rows={3}
                  maxLength={5000}
                  value={replies[caseItem.id] ?? caseItem.google_reply ?? ""}
                  onChange={(event) =>
                    setReplies((current) => ({ ...current, [caseItem.id]: event.target.value }))
                  }
                  placeholder="Paste the reply exactly as received…"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    busyCase === caseItem.id ||
                    (replies[caseItem.id] ?? caseItem.google_reply ?? "").trim().length < 3
                  }
                  onClick={() => void analyzeReply(caseItem.id)}
                >
                  {busyCase === caseItem.id ? "Analyzing…" : "Analyze reply"}
                </Button>
                {(replyAnalysis || caseItem.ai_status) && (
                  <div className="rounded-lg border p-3 text-sm" aria-live="polite">
                    <p>
                      <span className="font-semibold">Suggested status:</span>{" "}
                      {replyAnalysis?.status ?? caseItem.ai_status} · not independently verified
                    </p>
                    <p className="mt-1">{replyAnalysis?.next_step ?? caseItem.ai_next_step}</p>
                    {replyAnalysis && (
                      <p className="mt-1 text-muted-foreground">{replyAnalysis.reasoning}</p>
                    )}
                  </div>
                )}
              </div>
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  Case work log ({caseEvents.length})
                </summary>
                <ol className="mt-3 space-y-2">
                  {caseEvents.map((event) => (
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

export function AdminCasesPage() {
  const queryClient = useQueryClient();
  const adminData = useQuery({
    queryKey: adminDataKey,
    queryFn: useServerFn(getAdminInvestigatorData),
  });
  const assign = useServerFn(assignInvestigatorCase);
  const closeCase = useServerFn(closeInvestigatorCase);
  const [selectedReview, setSelectedReview] = useState("");
  const [selectedInvestigator, setSelectedInvestigator] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  const [closingCaseId, setClosingCaseId] = useState<string | null>(null);
  const candidates = adminData.data?.candidates ?? [];
  const current = candidates.find((candidate) => candidate.review_id === selectedReview);
  const activeInvestigators = (adminData.data?.investigators ?? []).filter(
    (person) => person.status === "active",
  );
  const closest = useMemo(() => {
    if (!current) return null;
    const normalize = (value: string | null | undefined) =>
      (value ?? "").trim().toLocaleLowerCase();
    return (
      [...activeInvestigators].sort((a, b) => {
        const score = (person: (typeof activeInvestigators)[number]) =>
          normalize(person.city) === normalize(current.business_city) &&
          normalize(current.business_city)
            ? 0
            : normalize(person.state) === normalize(current.business_state) &&
                normalize(current.business_state)
              ? 1
              : 2;
        return score(a) - score(b);
      })[0] ?? null
    );
  }, [activeInvestigators, current]);
  async function assignCase(investigatorId: string) {
    if (!current || !investigatorId) return;
    setBusy(true);
    try {
      await assign({
        data: {
          reviewId: current.review_id,
          scanId: current.scan_id,
          investigatorId,
          businessCity: city || current.business_city || "",
          businessState: state || current.business_state || "",
        },
      });
      await queryClient.invalidateQueries({ queryKey: adminDataKey });
      toast.success("Case assigned. Client and investigator work logs are available.");
      setSelectedReview("");
      setCity("");
      setState("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Case assignment failed.");
    } finally {
      setBusy(false);
    }
  }
  async function closeAssignedCase(caseId: string) {
    if (!window.confirm("Close this internal work case? This does not confirm a Google outcome."))
      return;
    setClosingCaseId(caseId);
    try {
      await closeCase({ data: { caseId } });
      await queryClient.invalidateQueries({ queryKey: adminDataKey });
      toast.success("Case closed; client work log updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Case could not be closed.");
    } finally {
      setClosingCaseId(null);
    }
  }
  if (adminData.isLoading) return <p>Loading admin case desk…</p>;
  if (adminData.error || !adminData.data)
    return (
      <p role="alert">Admin case desk unavailable: {adminData.error?.message ?? "No data."}</p>
    );
  return (
    <main className="space-y-6">
      <PageHeader
        title="Case assignment"
        subtitle="Assign cases from completed, client-owned scans with an exact review URL and source evidence."
      />
      <section className="surface space-y-4 p-4 sm:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="case-candidate">Completed scan review candidate</Label>
            <select
              id="case-candidate"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={selectedReview}
              onChange={(event) => {
                const candidate = candidates.find((row) => row.review_id === event.target.value);
                setSelectedReview(event.target.value);
                setCity(candidate?.business_city ?? "");
                setState(candidate?.business_state ?? "");
              }}
            >
              <option value="">Select a supported review concern…</option>
              {candidates.map((candidate) => (
                <option key={candidate.review_id} value={candidate.review_id}>
                  {candidate.business_name} · {candidate.risk} ·{" "}
                  {candidate.policy_angle ?? "Needs policy review"} ·{" "}
                  {candidate.review_text.slice(0, 90)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="case-city">Business city</Label>
            <Input id="case-city" value={city} onChange={(event) => setCity(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="case-state">Business state/region</Label>
            <Input
              id="case-state"
              value={state}
              onChange={(event) => setState(event.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="case-investigator">Active investigator</Label>
            <select
              id="case-investigator"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={selectedInvestigator}
              onChange={(event) => setSelectedInvestigator(event.target.value)}
            >
              <option value="">Select investigator…</option>
              {activeInvestigators.map((person) => (
                <option key={person.user_id} value={person.user_id}>
                  {person.name} · {person.city}, {person.state}
                </option>
              ))}
            </select>
          </div>
        </div>
        {current && (
          <div className="rounded-lg border p-3 text-sm">
            <p>
              <span className="font-semibold">Business:</span> {current.business_name} ·{" "}
              {(current.business_city ?? city) || "City not verified"}
            </p>
            <p className="mt-1">
              <span className="font-semibold">Evidence:</span>{" "}
              {current.evidence ||
                "No exact evidence quote. The assigned report will require evidence review."}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Same-city/state routing is an operational convenience only. It does not affect report
              eligibility, content, or Google's decision.
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!current || !selectedInvestigator || busy}
            onClick={() => void assignCase(selectedInvestigator)}
          >
            {busy ? "Assigning…" : "Assign selected"}
          </Button>
          <Button
            variant="outline"
            disabled={!current || !closest || busy}
            onClick={() => void assignCase(closest?.user_id ?? "")}
          >
            Auto-assign by nearest region
          </Button>
        </div>
      </section>
      <section className="surface space-y-3 p-4 sm:p-6">
        <h2 className="font-bold">Recent cases</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2">Business</th>
                <th>Investigator</th>
                <th>Status</th>
                <th>Policy concern</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {adminData.data.cases.slice(0, 50).map((item) => {
                const person = adminData.data.investigators.find(
                  (row) => row.user_id === item.investigator_id,
                );
                return (
                  <tr className="border-b" key={item.id}>
                    <td className="p-2">{item.business_name}</td>
                    <td>{person?.name ?? "Unassigned"}</td>
                    <td>
                      <CaseStatus status={item.status} />
                    </td>
                    <td>{item.policy_angle || "—"}</td>
                    <td>{new Date(item.created_at).toLocaleDateString()}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={item.status === "closed" || closingCaseId === item.id}
                        onClick={() => void closeAssignedCase(item.id)}
                      >
                        {item.status === "closed" ? "Closed" : "Close case"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export function AdminInvestigatorsPage() {
  const queryClient = useQueryClient();
  const adminData = useQuery({
    queryKey: adminDataKey,
    queryFn: useServerFn(getAdminInvestigatorData),
  });
  const setStatus = useServerFn(setInvestigatorStatus);
  const [busyId, setBusyId] = useState<string | null>(null);
  async function updateStatus(investigatorId: string, status: "active" | "disabled") {
    setBusyId(investigatorId);
    try {
      await setStatus({ data: { investigatorId, status } });
      await queryClient.invalidateQueries({ queryKey: adminDataKey });
      toast.success(`Investigator ${status}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Investigator status update failed.");
    } finally {
      setBusyId(null);
    }
  }
  if (adminData.isLoading) return <p>Loading investigator dashboard…</p>;
  if (adminData.error || !adminData.data)
    return (
      <p role="alert">
        Investigator dashboard unavailable: {adminData.error?.message ?? "No data."}
      </p>
    );
  const { investigators, cases, stats } = adminData.data;
  return (
    <main className="space-y-6">
      <PageHeader
        title="Investigators"
        subtitle="Internal staff access and case workload."
        action={
          <Link className="text-sm underline" to="/admin/cases">
            Assign a case
          </Link>
        }
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Total investigators", stats.totalInvestigators],
          ["Active today", stats.activeToday],
          ["Cases assigned", stats.assignedCases],
          ["Cases submitted", stats.submittedCases],
          ["Cases closed", stats.closedCases],
        ].map(([label, value]) => (
          <div className="surface p-4" key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </section>
      <section className="surface overflow-x-auto p-4 sm:p-6">
        <table className="w-full min-w-[740px] text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-2">Name</th>
              <th>Location</th>
              <th>Cases</th>
              <th>Submitted</th>
              <th>Last active</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {investigators.map((person) => {
              const ownCases = cases.filter((item) => item.investigator_id === person.user_id);
              return (
                <tr className="border-b" key={person.user_id}>
                  <td className="p-2">
                    <Link
                      className="underline"
                      to="/admin/investigators/$id"
                      params={{ id: person.user_id }}
                    >
                      {person.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{person.email}</span>
                  </td>
                  <td>
                    {person.city}, {person.state}
                  </td>
                  <td>{ownCases.length}</td>
                  <td>
                    {
                      ownCases.filter((item) =>
                        ["submitted", "reviewed", "closed"].includes(item.status),
                      ).length
                    }
                  </td>
                  <td>
                    {person.last_seen_at ? new Date(person.last_seen_at).toLocaleString() : "—"}
                  </td>
                  <td>
                    <CaseStatus status={person.status} />
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === person.user_id || person.status === "pending"}
                      onClick={() =>
                        void updateStatus(
                          person.user_id,
                          person.status === "active" ? "disabled" : "active",
                        )
                      }
                    >
                      {person.status === "active" ? "Disable" : "Activate"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}

export function AdminInvestigatorDetailPage({ id }: { id: string }) {
  const adminData = useQuery({
    queryKey: adminDataKey,
    queryFn: useServerFn(getAdminInvestigatorData),
  });
  if (adminData.isLoading) return <p>Loading investigator record…</p>;
  if (adminData.error || !adminData.data)
    return <p role="alert">{adminData.error?.message ?? "No data."}</p>;
  const person = adminData.data.investigators.find((row) => row.user_id === id);
  if (!person) return <p role="alert">Investigator not found.</p>;
  const cases = adminData.data.cases.filter((row) => row.investigator_id === id);
  return (
    <main className="space-y-5">
      <PageHeader
        title={person.name}
        subtitle={`${person.city}, ${person.state} · ${person.email}`}
        action={
          <Link className="text-sm underline" to="/admin/investigators">
            All investigators
          </Link>
        }
      />
      <section className="surface grid gap-3 p-5 sm:grid-cols-3">
        <p>Mobile: {person.mobile}</p>
        <p>Pincode: {person.pincode}</p>
        <p>Status: {person.status}</p>
      </section>
      <section className="surface space-y-3 p-5">
        <h2 className="font-bold">Assigned cases ({cases.length})</h2>
        {cases.map((item) => (
          <article className="rounded-lg border p-3" key={item.id}>
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-semibold">{item.business_name}</p>
              <CaseStatus status={item.status} />
            </div>
            <p className="mt-1 text-sm">{item.policy_angle || "Policy review required"}</p>
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

export function InvestigatorLoginRedirect() {
  return (
    <main className="mx-auto max-w-lg space-y-4">
      <PageHeader
        title="Investigator sign-in"
        subtitle="Investigator access uses the existing Rating Guard account login."
      />
      <section className="surface space-y-3 p-5">
        <p className="text-sm">
          Sign in with your staff account to access assigned cases. A separate mobile/login-code
          authentication system is not used.
        </p>
        <Button asChild>
          <Link to="/auth">Continue to sign in</Link>
        </Button>
      </section>
    </main>
  );
}

export function ClientInvestigatorWorkLog({ scanId }: { scanId: string }) {
  const load = useServerFn(getClientInvestigatorCases);
  const result = useQuery({
    queryKey: ["client-investigator-cases", scanId],
    queryFn: () => load({ data: { scanId } }),
  });
  if (result.isLoading)
    return <p className="mt-4 text-sm text-muted-foreground">Loading investigator work log…</p>;
  if (result.error)
    return (
      <p className="mt-4 text-sm" role="alert">
        Could not load investigator work log: {result.error.message}
      </p>
    );
  if (!result.data?.cases?.length) return null;
  const labels: Record<string, string> = {
    client_url_received: "Client scan URL received",
    case_assigned: "Case assigned to investigator",
    report_prepared: "Evidence-based draft prepared",
    submission_recorded: "Manual submission recorded",
    reply_received: "Google reply recorded",
    reply_analyzed: "Reply analysis completed (advisory)",
    case_closed: "Case closed",
  };
  return (
    <section className="mt-6 space-y-4 border-t pt-5" aria-label="Investigator work log">
      <h3 className="font-semibold">Investigator work log</h3>
      {result.data.cases.map((caseItem) => {
        const caseEvents = (result.data?.events ?? []).filter(
          (event) => event.case_id === caseItem.id,
        );
        return (
          <article className="rounded-lg border p-3" key={caseItem.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                {caseItem.business_name} · {caseItem.policy_angle || "Evidence review"}
              </p>
              <CaseStatus status={caseItem.status} />
            </div>
            {caseItem.ai_status && (
              <p className="mt-1 text-xs text-muted-foreground">
                Reply assessment: {caseItem.ai_status} — advisory only, not a verified Google
                outcome. {caseItem.ai_next_step}
              </p>
            )}
            <ol className="mt-3 space-y-2">
              {caseEvents.map((event) => (
                <li className="border-l-2 pl-3 text-xs" key={event.id}>
                  <p className="font-medium">{labels[event.event_type] ?? "Case activity"}</p>
                  <time className="text-muted-foreground">
                    {new Date(event.created_at).toLocaleString()}
                  </time>
                </li>
              ))}
            </ol>
          </article>
        );
      })}
      <p className="text-xs text-muted-foreground">
        These are app-recorded events. Submission is manually reported and Google outcomes are not
        independently verified here.
      </p>
    </section>
  );
}
