import { z } from "zod";
import type { Tables } from "@/integrations/supabase/types";

export type RemovalOutcome = Tables<"removal_outcomes">;
export type Appeal = Tables<"appeal_tracking">;
export type OutcomeRecord = Pick<RemovalOutcome, "policy_type" | "business_type" | "outcome">;
export const submissionSchema = z
  .object({
    scan_id: z.string().uuid(),
    review_id: z.string().uuid(),
    policy_type: z.string().trim().min(1).max(200),
    business_type: z.string().trim().min(1).max(200),
    submitted_at: z.string().datetime(),
    verification_reference: z.string().trim().min(10).max(2000),
    request_text: z.string().trim().min(1).max(12000),
    confirmed: z.literal(true),
  })
  .refine(
    (value) => Date.parse(value.submitted_at) <= Date.now(),
    "Submission date cannot be in the future.",
  );

export function outcomeSummary(rows: Pick<RemovalOutcome, "outcome">[]) {
  const total = rows.length;
  const approved = rows.filter((row) => row.outcome === "approved").length;
  const rejected = rows.filter((row) => row.outcome === "rejected").length;
  const pending = rows.filter((row) => row.outcome === "pending").length;
  const decided = approved + rejected;
  return {
    total,
    approved,
    rejected,
    pending,
    decided,
    approvedPercent: total ? Math.round((approved / total) * 100) : null,
    rejectedPercent: total ? Math.round((rejected / total) * 100) : null,
    pendingPercent: total ? Math.round((pending / total) * 100) : null,
    decidedSuccessPercent: decided ? Math.round((approved / decided) * 100) : null,
  };
}
export function outcomeGroups(rows: OutcomeRecord[], field: "policy_type" | "business_type") {
  const groups = new Map<string, OutcomeRecord[]>();
  for (const row of rows) {
    const key = row[field];
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups]
    .map(([name, outcomes]) => ({ name, ...outcomeSummary(outcomes) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
export function strategyNotes(rows: OutcomeRecord[]) {
  return outcomeGroups(rows, "policy_type")
    .filter((group) => group.decided >= 10)
    .map(
      (group) =>
        `${group.name}: ${group.approved}/${group.decided} manually recorded decided requests approved (${group.decidedSuccessPercent}%). Observational sample, not causal proof or a prediction; prioritize relevant verified evidence, never change a policy classification to match this rate.`,
    );
}
export function appealDue(appeal: Appeal, now = Date.now()) {
  return (
    (appeal.status === "pending" || appeal.status === "needed" || appeal.status === "draft") &&
    Date.parse(appeal.due_at) <= now
  );
}
export function draftAppeal(outcome: RemovalOutcome) {
  if (outcome.outcome !== "rejected")
    throw new Error("Record a verified rejection before drafting an appeal.");
  return `To the Google Maps review moderation team:

I request the available one-time appeal of the review removal decision recorded for request ${outcome.id}. The original submission was recorded on ${outcome.submitted_at}, under the policy category "${outcome.policy_type}".

Decision reference supplied by the authorized representative: ${outcome.verification_reference}

Original submitted request (review facts and quotations must be verified before reuse):
${outcome.request_text}

Please reassess the supplied review and authentic supporting evidence against the applicable Google policy. No additional facts, jurisdiction, court findings or documents are established by this draft. A negative rating or disagreement alone is not grounds for removal. This appeal does not seek to suppress legitimate criticism.

[Add only new verified evidence, identify its source, and explain how it addresses Google's stated rejection reason. Redact unnecessary personal information.]

Please communicate the result through the official Reviews Management Tool or the authorized account email. This is an adapted policy draft, not legal advice. Nothing has been submitted automatically. If a legal issue is suspected, qualified local counsel must assess it before any legal notice.

Respectfully,
[Authorized business representative]`;
}
