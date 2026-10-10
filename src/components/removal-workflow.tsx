import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateAppealDraft } from "@/lib/appeal.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Scan, AnalyzedReview } from "@/lib/data";
import type { LegalReview } from "@/lib/legal-analysis";
import {
  appealDue,
  draftAppeal,
  outcomeGroups,
  outcomeSummary,
  strategyNotes,
  submissionSchema,
  type RemovalOutcome,
  type Appeal,
} from "@/lib/removal-workflow";
import { Button } from "./ui/button";

const fieldClass = "my-1 w-full rounded border bg-transparent p-2";
async function loadWorkflow() {
  const [outcomes, appeals] = await Promise.all([
    supabase
      .from("removal_outcomes")
      .select("*", { count: "exact" })
      .order("submitted_at", { ascending: false })
      .limit(5000)
      .throwOnError(),
    supabase
      .from("appeal_tracking")
      .select("*", { count: "exact" })
      .order("due_at")
      .limit(5000)
      .throwOnError(),
  ]);
  if ((outcomes.count ?? 0) > 5000 || (appeals.count ?? 0) > 5000)
    throw new Error(
      "Workflow exceeds 5,000 records. Add paginated reporting before calculating complete rates.",
    );
  return { outcomes: outcomes.data, appeals: appeals.data };
}
const workflowQuery = {
  queryKey: ["removal-workflow"],
  queryFn: loadWorkflow,
  refetchInterval: 60000,
};

export function RemovalSubmissionForm({
  scan,
  review,
  legal,
}: {
  scan: Scan;
  review: AnalyzedReview;
  legal: LegalReview;
}) {
  const cache = useQueryClient();
  const workflow = useQuery(workflowQuery);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (workflow.error)
    return <p role="alert">Removal tracking unavailable: {workflow.error.message}</p>;
  const existing = workflow.data?.outcomes.find((row) => row.review_id === review.id);
  if (existing)
    return (
      <p className="mt-2">
        Manually recorded submission: {existing.outcome}. Manage follow-up on the dashboard.
      </p>
    );
  return (
    <div className="no-print mt-3">
      <Button variant="outline" disabled={workflow.isPending} onClick={() => setOpen(!open)}>
        Record Actual Google Submission
      </Button>
      {open && (
        <form
          className="my-3 rounded border p-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setBusy(true);
            try {
              const submitted = String(form.get("submitted_at"));
              if (!Number.isFinite(Date.parse(submitted)))
                throw new Error("Enter the actual submission date.");
              const input = submissionSchema.parse({
                scan_id: scan.id,
                review_id: review.id,
                policy_type: form.get("policy_type"),
                business_type: form.get("business_type"),
                submitted_at: new Date(submitted).toISOString(),
                verification_reference: form.get("reference"),
                request_text: form.get("request_text"),
                confirmed: form.get("confirmed") === "on",
              });
              const { confirmed: _confirmed, ...row } = input;
              await supabase
                .from("removal_outcomes")
                .insert({
                  ...row,
                  evidence_used: {
                    quote: legal.evidence_quote,
                    readiness_score: legal.quality?.total ?? null,
                    source:
                      "Manually recorded by Super Admin; not independently verified with Google.",
                  },
                })
                .select("id")
                .single()
                .throwOnError();
              await cache.invalidateQueries({ queryKey: ["removal-workflow"] });
              toast.success(
                "Actual submission recorded; 7-day follow-up scheduled. Nothing submitted by this app.",
              );
              setOpen(false);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not record submission.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            Only record a request you actually submitted through Google. Opening a link is not a
            submission.
          </p>
          <label>
            Policy category
            <input
              name="policy_type"
              required
              maxLength={200}
              defaultValue={legal.policy_type}
              className={fieldClass}
            />
          </label>
          <label>
            Business category
            <input
              name="business_type"
              required
              maxLength={200}
              defaultValue={scan.category ?? ""}
              className={fieldClass}
            />
          </label>
          <label>
            Actual submission date
            <input name="submitted_at" type="datetime-local" required className={fieldClass} />
          </label>
          <label>
            Google case/email reference (avoid personal information)
            <textarea
              name="reference"
              required
              minLength={10}
              maxLength={2000}
              className={fieldClass}
            />
          </label>
          <label>
            Text actually submitted
            <textarea
              name="request_text"
              required
              maxLength={12000}
              defaultValue={legal.removal_request_text}
              className={`${fieldClass} h-40`}
            />
          </label>
          <label className="my-2 block">
            <input type="checkbox" name="confirmed" required /> I confirm this was submitted to
            Google; this is not an AI estimate.
          </label>
          <Button disabled={busy}>{busy ? "Saving..." : "Save Submission Record"}</Button>
        </form>
      )}
    </div>
  );
}

function OutcomeFollowup({
  outcome,
  appeal,
}: {
  outcome: RemovalOutcome;
  appeal: Appeal | undefined;
}) {
  const generate = useServerFn(generateAppealDraft);
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(appeal?.appeal_draft ?? "");
  async function saveAppeal(submitted: boolean) {
    if (!appeal) return;
    setBusy(true);
    try {
      if (outcome.outcome !== "rejected")
        throw new Error("A verified rejection is required before appeal.");
      if (!draft.trim()) throw new Error("Prepare and review the appeal draft first.");
      await supabase
        .from("appeal_tracking")
        .update({
          appeal_draft: draft,
          status: submitted ? "submitted" : "draft",
          ...(submitted ? { submitted_at: new Date().toISOString() } : {}),
        })
        .eq("id", appeal.id)
        .select("id")
        .single()
        .throwOnError();
      await cache.invalidateQueries({ queryKey: ["removal-workflow"] });
      toast.success(
        submitted ? "Manual appeal submission recorded." : "Appeal draft saved. Not submitted.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save appeal.");
    } finally {
      setBusy(false);
    }
  }
  const due = appeal && appealDue(appeal);
  return (
    <details className="my-3 rounded border p-3">
      <summary className="cursor-pointer font-semibold">
        {outcome.policy_type} / {outcome.business_type} — {outcome.outcome}
        {due ? " — Follow-up due: check Google status manually" : ""}
      </summary>
      <p>
        Review ID: {outcome.review_id}. Submitted: {new Date(outcome.submitted_at).toLocaleString()}
        .
      </p>
      <p className="text-sm">
        Appeal: {appeal?.status ?? "Not scheduled"}. Google status is not polled. No automated
        email/WhatsApp delivery.
      </p>
      <form
        className="my-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          const form = new FormData(event.currentTarget);
          try {
            const value = form.get("outcome");
            if (value !== "pending" && value !== "approved" && value !== "rejected")
              throw new Error("Invalid decision.");
            const reference = String(form.get("reference")).trim();
            if (reference.length < 10 || reference.length > 2000)
              throw new Error("Supply an actual Google decision reference (10-2000 characters).");
            const rawDate = String(form.get("response_at"));
            const date = rawDate ? Date.parse(rawDate) : NaN;
            if (
              value !== "pending" &&
              (!Number.isFinite(date) ||
                date < Date.parse(outcome.submitted_at) ||
                date > Date.now())
            )
              throw new Error("Decision date must be between submission and now.");
            await supabase
              .from("removal_outcomes")
              .update({
                outcome: value,
                response_at: value === "pending" ? null : new Date(date).toISOString(),
                verification_reference: reference,
              })
              .eq("id", outcome.id)
              .select("id")
              .single()
              .throwOnError();
            await cache.invalidateQueries({ queryKey: ["removal-workflow"] });
            toast.success("Manually verified decision recorded.");
            if (value === "rejected" && outcome.outcome !== "rejected" && !appeal?.submitted_at) {
              try {
                const result = await generate({ data: { outcomeId: outcome.id } });
                setDraft(result.draft);
                await cache.invalidateQueries({ queryKey: ["removal-workflow"] });
                toast.success(
                  "AI appeal draft generated and saved. Review it before manual submission.",
                );
              } catch (error) {
                toast.error(
                  `Decision saved, but AI appeal draft failed: ${error instanceof Error ? error.message : "Unknown error"}`,
                );
              }
            }
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not record decision.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Actual Google decision
          <select name="outcome" defaultValue={outcome.outcome} className={fieldClass}>
            <option value="pending">Pending — not yet decided</option>
            <option value="approved">Approved — Google confirmed removal</option>
            <option value="rejected">Rejected — Google confirmed no violation</option>
          </select>
        </label>
        <label>
          Decision date
          <input name="response_at" type="datetime-local" className={fieldClass} />
        </label>
        <label>
          Decision/case reference
          <textarea
            name="reference"
            required
            minLength={10}
            maxLength={2000}
            defaultValue={outcome.verification_reference}
            className={fieldClass}
          />
        </label>
        <Button disabled={busy}>Record Verified Decision</Button>
      </form>
      <a
        className="text-brand underline"
        href="https://support.google.com/business/workflow/9945796"
        target="_blank"
        rel="noopener noreferrer"
      >
        Check Google status / one-time appeal
      </a>
      {" · "}
      <a
        className="text-brand underline"
        href="https://support.google.com/business/gethelp"
        target="_blank"
        rel="noopener noreferrer"
      >
        Google Business Support
      </a>
      {outcome.outcome === "rejected" &&
        appeal &&
        appeal.status !== "submitted" &&
        appeal.status !== "closed" && (
          <div className="my-3">
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await generate({ data: { outcomeId: outcome.id } });
                  setDraft(result.draft);
                  await cache.invalidateQueries({ queryKey: ["removal-workflow"] });
                  toast.success("AI appeal draft saved. Not submitted to Google.");
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "AI appeal generation failed.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Generate AI Appeal Draft
            </Button>
            <Button variant="outline" onClick={() => setDraft(draftAppeal(outcome))}>
              Adapt Original Request into Appeal Draft
            </Button>
            <p className="text-sm">
              AI generation requires a recorded rejection and source-validated policy evidence. The
              adaptation option makes no AI call. Neither establishes a legal violation; review
              every fact before Google's one-time appeal.
            </p>
            <textarea
              aria-label="Editable appeal draft"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={16000}
              className={`${fieldClass} h-64`}
            />
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !draft.trim()} onClick={() => saveAppeal(false)}>
                Save Draft
              </Button>
              <Button
                variant="outline"
                disabled={!draft.trim()}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(draft);
                    toast.success("Draft copied; not submitted.");
                  } catch (error) {
                    console.error("[appeal] Copy failed", error);
                    toast.error("Could not copy the appeal draft.");
                  }
                }}
              >
                Copy Appeal
              </Button>
              <Button
                variant="outline"
                disabled={busy || !draft.trim()}
                onClick={() => {
                  if (
                    window.confirm(
                      "Only confirm if you actually submitted this one-time appeal through Google.",
                    )
                  )
                    void saveAppeal(true);
                }}
              >
                Confirm Manual Appeal Submission
              </Button>
            </div>
          </div>
        )}
      <p className="mt-2 text-sm">
        Legal escalation: consult qualified local counsel; this app does not issue legal notices or
        claim liability.
      </p>
      <p className="text-sm">
        For reminders, share the private dashboard link yourself. Recipients still require Super
        Admin access.
      </p>
    </details>
  );
}

export function RemovalAnalytics() {
  const query = useQuery(workflowQuery);
  if (query.isPending) return <p>Loading removal outcomes...</p>;
  if (query.error) return <p role="alert">Removal analytics unavailable: {query.error.message}</p>;
  const rows = query.data.outcomes;
  const summary = outcomeSummary(rows);
  const groups = [
    { label: "Policy-wise", rows: outcomeGroups(rows, "policy_type") },
    { label: "Business-category-wise", rows: outcomeGroups(rows, "business_type") },
  ];
  const strategies = strategyNotes(rows);
  return (
    <section className="surface my-6 p-5">
      <h2 className="text-lg font-bold">Removal Success Analytics &amp; Appeals</h2>
      <p className="my-2 text-sm">
        Actual submissions and outcomes manually recorded by Super Admin. No sample numbers,
        automatic Google submissions, or inferred approvals. Refreshes app records every minute—not
        Google responses.
      </p>
      <p>
        Total submitted: {summary.total} · Approved: {summary.approved} (
        {summary.approvedPercent ?? "N/A"}%) · Rejected: {summary.rejected} (
        {summary.rejectedPercent ?? "N/A"}%) · Pending: {summary.pending} (
        {summary.pendingPercent ?? "N/A"}%)
      </p>
      <p>
        Decided-case success rate:{" "}
        {summary.decidedSuccessPercent === null
          ? "Not available — no decisions"
          : `${summary.decidedSuccessPercent}% (${summary.approved}/${summary.decided})`}
        . Pending cases are excluded from this denominator.
      </p>
      {!rows.length && (
        <p className="my-3">
          No real submissions recorded. Use “Record Actual Google Submission” on a report after
          submitting to Google.
        </p>
      )}
      {groups.map((group) => (
        <div key={group.label} className="my-4 overflow-x-auto">
          <h3 className="font-semibold">{group.label}</h3>
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Category</th>
                <th>Approved</th>
                <th>Rejected</th>
                <th>Pending</th>
                <th>Decided-case success</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((item) => (
                <tr key={item.name}>
                  <td>{item.name}</td>
                  <td>{item.approved}</td>
                  <td>{item.rejected}</td>
                  <td>{item.pending}</td>
                  <td>
                    {item.decidedSuccessPercent === null
                      ? "N/A"
                      : `${item.decidedSuccessPercent}% (${item.decided} decisions)`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <h3 className="font-semibold">Strategy evidence (minimum 10 decided cases per policy)</h3>
      {strategies.length ? (
        <ul className="list-disc pl-5">
          {strategies.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : (
        <p>
          Insufficient recorded decisions to prioritize strategies. No model retraining claimed.
        </p>
      )}
      <h3 className="mt-4 font-semibold">Seven-day follow-up &amp; one-time appeal preparation</h3>
      <p className="text-sm">
        A due reminder is not a rejection. Check the official tool and enter the actual response.
        Absence from a 5-review Places sample is not proof of removal.
      </p>
      {rows.map((outcome) => (
        <OutcomeFollowup
          key={outcome.id}
          outcome={outcome}
          appeal={query.data.appeals.find((appeal) => appeal.removal_request_id === outcome.id)}
        />
      ))}
    </section>
  );
}
