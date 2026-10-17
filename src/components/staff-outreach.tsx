import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type View = "activity" | "evidence" | "timeline";
type Communication = {
  id: string;
  review_tracking_id: string;
  staff_id: string;
  log_type: "call" | "whatsapp" | "email";
  direction: "outbound" | "inbound";
  contact_person: string | null;
  contact_number: string | null;
  contact_email: string | null;
  summary: string;
  outcome: string;
  follow_up_at: string | null;
  created_at: string;
};
type AssignedCase = {
  id: string;
  business_name: string;
  status: string;
  assigned_at: string;
  updated_at: string;
};
type CaseEvent = {
  id: string;
  case_id: string;
  event_type: string;
  created_at: string;
};

const queryKey = ["staff-outreach"];
const maxEvidenceBytes = 10 * 1024 * 1024;
const noCases: AssignedCase[] = [];
const allowedTypes: Record<
  string,
  { mime: string; kind: "screenshot" | "pdf" | "audio" | "video" | "document" }
> = {
  jpg: { mime: "image/jpeg", kind: "screenshot" },
  jpeg: { mime: "image/jpeg", kind: "screenshot" },
  png: { mime: "image/png", kind: "screenshot" },
  pdf: { mime: "application/pdf", kind: "pdf" },
  mp3: { mime: "audio/mpeg", kind: "audio" },
  mp4: { mime: "video/mp4", kind: "video" },
  txt: { mime: "text/plain", kind: "document" },
};

async function loadStaffRecords() {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Could not verify your session: ${authError.message}`);
  if (!auth.user) throw new Error("Sign in to view staff activity.");
  const [cases, communications, evidence] = await Promise.all([
    supabase
      .from("staff_cases")
      .select("id,business_name,status,assigned_at,updated_at")
      .eq("staff_id", auth.user.id)
      .order("assigned_at", { ascending: false })
      .limit(500),
    supabase
      .from("communication_log")
      .select("*")
      .eq("staff_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("communication_evidence")
      .select("*")
      .eq("staff_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);
  if (cases.error) throw new Error(`Could not load assigned reviews: ${cases.error.message}`);
  if (communications.error)
    throw new Error(`Could not load communication history: ${communications.error.message}`);
  if (evidence.error) throw new Error(`Could not load evidence: ${evidence.error.message}`);
  const caseEvents =
    cases.data.length > 0
      ? await supabase
          .from("staff_case_events")
          .select("id,case_id,event_type,created_at")
          .in(
            "case_id",
            cases.data.map((item) => item.id),
          )
          .order("created_at", { ascending: false })
          .limit(2000)
      : { data: [] as CaseEvent[], error: null };
  if (caseEvents.error)
    throw new Error(`Could not load review history: ${caseEvents.error.message}`);
  const signedEvidence = await Promise.all(
    evidence.data.map(async (item) => {
      const { data, error } = await supabase.storage
        .from("evidence")
        .createSignedUrl(item.file_url, 300);
      if (error) throw new Error(`Could not open ${item.file_name}: ${error.message}`);
      return { ...item, signedUrl: data.signedUrl };
    }),
  );
  return {
    userId: auth.user.id,
    cases: cases.data as AssignedCase[],
    communications: communications.data as Communication[],
    evidence: signedEvidence,
    caseEvents: caseEvents.data ?? [],
  };
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function CommunicationForm({
  cases,
  userId,
  onSaved,
}: {
  cases: AssignedCase[];
  userId: string;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caseId, setCaseId] = useState(cases[0]?.id ?? "");
  const [type, setType] = useState<"call" | "whatsapp" | "email">("call");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const summary = String(form.get("summary") ?? "").trim();
    const number = String(form.get("contact_number") ?? "").trim();
    const email = String(form.get("contact_email") ?? "").trim();
    const subject = String(form.get("email_subject") ?? "").trim();
    if (!caseId) {
      toast.error("Choose one of your assigned reviews.");
      return;
    }
    if (!summary) {
      toast.error("Add a summary before saving.");
      return;
    }
    if (type === "call" && !number) {
      toast.error("Enter the phone number for a call log.");
      return;
    }
    if (type === "email" && (!email || !subject)) {
      toast.error("Enter the recipient email and subject.");
      return;
    }
    const fileRule = file && allowedTypes[file.name.split(".").pop()?.toLowerCase() ?? ""];
    if (file && (!fileRule || file.size > maxEvidenceBytes || file.type !== fileRule.mime)) {
      toast.error("Attach a correctly typed JPG, PNG, PDF, MP3, MP4 or TXT file under 10 MB.");
      return;
    }

    setBusy(true);
    let uploadedPath: string | null = null;
    let savedLog = false;
    const logId = crypto.randomUUID();
    try {
      if (file && fileRule) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180) || "evidence";
        uploadedPath = `${userId}/${logId}/${crypto.randomUUID()}-${safeName}`;
        const { error } = await supabase.storage
          .from("evidence")
          .upload(uploadedPath, file, { contentType: fileRule.mime, upsert: false });
        if (error) throw new Error(`Evidence upload failed: ${error.message}`);
      }

      const followUp = String(form.get("follow_up_at") ?? "");
      const { error: logError } = await supabase.from("communication_log").insert({
        id: logId,
        review_tracking_id: caseId,
        staff_id: userId,
        log_type: type,
        direction: String(form.get("direction")) as "outbound" | "inbound",
        contact_person: String(form.get("contact_person") ?? "").trim() || null,
        contact_number: number || null,
        contact_email: email || null,
        summary,
        outcome: String(form.get("outcome")) as "no_answer" | "agreed" | "refused" | "considering",
        follow_up_at: followUp ? new Date(followUp).toISOString() : null,
        duration_seconds:
          type === "call" && String(form.get("duration_seconds"))
            ? Number(form.get("duration_seconds"))
            : null,
        email_subject: type === "email" ? subject : null,
        email_body: type === "email" ? summary : null,
      });
      if (logError) throw new Error(`Could not save communication log: ${logError.message}`);
      savedLog = true;

      if (file && fileRule && uploadedPath) {
        const { error: evidenceError } = await supabase.from("communication_evidence").insert({
          communication_log_id: logId,
          staff_id: userId,
          evidence_type: fileRule.kind,
          file_url: uploadedPath,
          file_name: file.name,
          uploaded_by: userId,
        });
        if (evidenceError) {
          const { error: removeError } = await supabase.storage
            .from("evidence")
            .remove([uploadedPath]);
          if (removeError)
            console.error("[staff-outreach] Could not remove unattached evidence", removeError);
          throw new Error(
            `Communication saved, but evidence metadata failed: ${evidenceError.message}`,
          );
        }
      }

      formElement.reset();
      setFile(null);
      await onSaved();
      toast.success("Communication and activity record saved.");
    } catch (error) {
      if (!savedLog && uploadedPath) {
        const { error: removeError } = await supabase.storage
          .from("evidence")
          .remove([uploadedPath]);
        if (removeError)
          console.error("[staff-outreach] Could not clean up unattached evidence", removeError);
      }
      if (savedLog) {
        formElement.reset();
        setFile(null);
        await onSaved();
      }
      toast.error(error instanceof Error ? error.message : "Could not save communication.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="surface space-y-4 p-4 sm:p-5" onSubmit={(event) => void submit(event)}>
      <h2 className="font-semibold">Log Communication</h2>
      {!cases.length ? (
        <p className="text-sm text-muted-foreground">
          You have no assigned reviews to log against.
        </p>
      ) : (
        <>
          <FormField label="Assigned review">
            <select
              className="h-11 w-full rounded-md border bg-background px-3 text-sm"
              value={caseId}
              onChange={(event) => setCaseId(event.target.value)}
              required
            >
              {cases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.business_name} — {item.status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Type">
              <select
                className="h-11 w-full rounded-md border bg-background px-3 text-sm"
                value={type}
                onChange={(event) => setType(event.target.value as typeof type)}
              >
                <option value="call">Call</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
              </select>
            </FormField>
            <FormField label="Direction">
              <select
                name="direction"
                className="h-11 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="outbound">Outbound</option>
                <option value="inbound">Inbound</option>
              </select>
            </FormField>
            <FormField label="Contact person (optional)">
              <Input name="contact_person" maxLength={160} />
            </FormField>
            {type !== "email" && (
              <FormField label={type === "call" ? "Contact number" : "Contact number (optional)"}>
                <Input name="contact_number" type="tel" maxLength={32} required={type === "call"} />
              </FormField>
            )}
            {type === "email" && (
              <>
                <FormField label="Recipient email">
                  <Input name="contact_email" type="email" maxLength={320} required />
                </FormField>
                <FormField label="Email subject">
                  <Input name="email_subject" maxLength={500} required />
                </FormField>
              </>
            )}
            {type === "call" && (
              <FormField label="Duration in seconds (optional)">
                <Input name="duration_seconds" type="number" min={0} max={86400} />
              </FormField>
            )}
            <FormField label="Outcome">
              <select
                name="outcome"
                className="h-11 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="no_answer">No answer</option>
                <option value="agreed">Agreed</option>
                <option value="refused">Refused</option>
                <option value="considering">Considering</option>
              </select>
            </FormField>
            <FormField label="Follow-up date (optional)">
              <Input name="follow_up_at" type="datetime-local" />
            </FormField>
          </div>
          <FormField label={type === "email" ? "Email body / summary" : "Summary"}>
            <Textarea name="summary" rows={4} maxLength={4000} required />
          </FormField>
          <FormField label="Attach evidence (JPG, PNG, PDF, MP3, MP4, TXT; max 10 MB)">
            <Input
              type="file"
              accept=".jpg,.jpeg,.png,.pdf,.mp3,.mp4,.txt"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </FormField>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save activity"}
          </Button>
        </>
      )}
    </form>
  );
}

function RecordCard({ item, businessName }: { item: Communication; businessName: string }) {
  return (
    <article className="surface space-y-2 p-4">
      <header className="flex flex-wrap justify-between gap-2">
        <h3 className="font-semibold">
          {businessName} · {item.log_type}
        </h3>
        <time className="text-xs text-muted-foreground">
          {new Date(item.created_at).toLocaleString()}
        </time>
      </header>
      <p className="text-xs text-muted-foreground">
        {item.direction} · {item.outcome.replaceAll("_", " ")}
        {item.contact_person ? ` · ${item.contact_person}` : ""}
        {item.contact_number ? ` · ${item.contact_number}` : ""}
        {item.contact_email ? ` · ${item.contact_email}` : ""}
      </p>
      <p className="whitespace-pre-wrap text-sm">{item.summary}</p>
      {item.follow_up_at && (
        <p className="text-xs text-muted-foreground">
          Follow-up: {new Date(item.follow_up_at).toLocaleString()}
        </p>
      )}
    </article>
  );
}

export function StaffOutreachPage({ view }: { view: View }) {
  const client = useQueryClient();
  const records = useQuery({
    queryKey: queryKey,
    queryFn: loadStaffRecords,
  });
  const [formOpen, setFormOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState("");
  const cases = records.data?.cases ?? noCases;
  const communications = records.data?.communications ?? [];
  const businessById = useMemo(
    () => new Map(cases.map((item) => [item.id, item.business_name])),
    [cases],
  );
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey }),
      client.invalidateQueries({ queryKey: ["staff-inactivity"] }),
    ]);
  };
  if (records.isLoading) return <p>Loading your activity…</p>;
  if (records.error || !records.data)
    return <p role="alert">Could not load staff activity: {records.error?.message}</p>;

  if (view === "evidence")
    return (
      <div className="space-y-5">
        <PageHeader
          title="Evidence Vault"
          subtitle="Private files attached to your communication records."
        />
        {records.data.evidence.length ? (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {records.data.evidence.map((item) => (
              <article className="surface space-y-2 p-4" key={item.id}>
                <p className="font-medium break-all">{item.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.evidence_type} · {new Date(item.created_at).toLocaleString()}
                </p>
                <a
                  className="text-sm text-primary underline"
                  href={item.signedUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open private evidence
                </a>
              </article>
            ))}
          </section>
        ) : (
          <p className="surface p-5 text-sm text-muted-foreground">
            No evidence has been uploaded.
          </p>
        )}
      </div>
    );

  const selected = view === "timeline" ? selectedCase : "";
  const shownCommunications = selected
    ? communications.filter((item) => item.review_tracking_id === selected)
    : communications;
  const timelineEvents =
    view === "timeline" && selected
      ? [
          ...shownCommunications.map((item) => ({
            id: item.id,
            createdAt: item.created_at,
            title: `${item.direction} ${item.log_type} · ${item.outcome.replaceAll("_", " ")}`,
            summary: item.summary,
          })),
          ...records.data.caseEvents
            .filter((item) => item.case_id === selected)
            .map((item) => ({
              id: item.id,
              createdAt: item.created_at,
              title: item.event_type.replaceAll("_", " "),
              summary: "",
            })),
        ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      : [];
  return (
    <div className="space-y-5">
      <PageHeader
        title={view === "timeline" ? "Review Timeline" : "My Activity"}
        subtitle={
          view === "timeline"
            ? "Select an assigned review to see its contact and response history."
            : "A private timeline of your recorded calls, WhatsApp messages, emails and follow-ups."
        }
        action={
          view === "activity" ? (
            <Button onClick={() => setFormOpen((open) => !open)}>
              {formOpen ? "Close form" : "Log Communication"}
            </Button>
          ) : undefined
        }
      />
      {view === "timeline" && (
        <FormField label="Review">
          <select
            className="h-11 w-full rounded-md border bg-background px-3 text-sm"
            value={selectedCase}
            onChange={(event) => setSelectedCase(event.target.value)}
          >
            <option value="">Choose an assigned review</option>
            {cases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.business_name}
              </option>
            ))}
          </select>
        </FormField>
      )}
      {view === "activity" && formOpen && (
        <CommunicationForm
          cases={cases}
          userId={records.data.userId}
          onSaved={async () => {
            await refresh();
            setFormOpen(false);
          }}
        />
      )}
      {view === "timeline" ? (
        selectedCase && timelineEvents.length ? (
          <section className="space-y-3">
            {timelineEvents.map((item) => (
              <article className="surface space-y-2 p-4" key={item.id}>
                <header className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-semibold capitalize">{item.title}</h3>
                  <time className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </time>
                </header>
                {item.summary && <p className="whitespace-pre-wrap text-sm">{item.summary}</p>}
              </article>
            ))}
          </section>
        ) : (
          <p className="surface p-5 text-sm text-muted-foreground">
            {selectedCase
              ? "No history has been recorded for this review."
              : "Choose a review to open its timeline."}
          </p>
        )
      ) : shownCommunications.length ? (
        <section className="space-y-3">
          {shownCommunications.map((item) => (
            <RecordCard
              key={item.id}
              item={item}
              businessName={businessById.get(item.review_tracking_id) ?? "Assigned review"}
            />
          ))}
        </section>
      ) : (
        <p className="surface p-5 text-sm text-muted-foreground">
          No communication activity has been logged.
        </p>
      )}
    </div>
  );
}
