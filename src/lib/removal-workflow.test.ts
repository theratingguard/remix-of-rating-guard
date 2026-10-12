import { describe, expect, it } from "vitest";
import {
  appealDue,
  draftAppeal,
  outcomeSummary,
  strategyNotes,
  submissionSchema,
  type RemovalOutcome,
  type Appeal,
} from "./removal-workflow";
const outcome: RemovalOutcome = {
  id: "00000000-0000-4000-8000-000000000001",
  country: "US",
  method: "google-policy-review",
  review_id: "00000000-0000-4000-8000-000000000002",
  review_type: "Spam",
  scan_id: "00000000-0000-4000-8000-000000000003",
  user_id: "00000000-0000-4000-8000-000000000004",
  policy_type: "Spam",
  business_type: "Hotel",
  submitted_at: "2026-01-01T00:00:00Z",
  outcome: "pending",
  response_at: null,
  verification_reference: "Actual case reference",
  evidence_used: {},
  request_text: "Original submitted request",
  created_at: "2026-01-01T00:00:00Z",
};
describe("Real outcome analytics and appeals", () => {
  it("uses real counts and distinguishes total from decided-case rates", () => {
    expect(
      outcomeSummary([{ outcome: "approved" }, { outcome: "rejected" }, { outcome: "pending" }]),
    ).toMatchObject({ total: 3, approvedPercent: 33, decidedSuccessPercent: 50 });
    expect(outcomeSummary([]).decidedSuccessPercent).toBeNull();
    expect(outcomeSummary([{ outcome: "pending" }]).decidedSuccessPercent).toBeNull();
  });
  it("rejects imaginary future submissions and requires confirmation", () => {
    expect(submissionSchema.safeParse({ ...outcome, confirmed: true }).success).toBe(true);
    expect(submissionSchema.safeParse({ ...outcome, confirmed: false }).success).toBe(false);
    expect(
      submissionSchema.safeParse({
        ...outcome,
        confirmed: true,
        submitted_at: "2999-01-01T00:00:00Z",
      }).success,
    ).toBe(false);
  });
  it("does not call a seven-day reminder a rejection or draft without a decision", () => {
    const appeal: Appeal = {
      id: "fixture",
      removal_request_id: outcome.id,
      submitted_at: null,
      response_at: null,
      response: null,
      appeal_draft: null,
      status: "pending",
      due_at: "2026-01-08T00:00:00Z",
    };
    expect(appealDue(appeal, Date.parse("2026-01-07T23:59:59Z"))).toBe(false);
    expect(appealDue(appeal, Date.parse("2026-01-08T00:00:00Z"))).toBe(true);
    expect(appealDue({ ...appeal, status: "closed" })).toBe(false);
    expect(() => draftAppeal(outcome)).toThrow("verified rejection");
    const draft = draftAppeal({ ...outcome, outcome: "rejected" });
    expect(draft).toContain("one-time appeal");
    expect(draft).toContain(outcome.request_text);
    expect(draft).toContain("Nothing has been submitted automatically");
  });
  it("requires ten decided cases and does not treat rates as causal evidence", () => {
    expect(
      strategyNotes(Array.from({ length: 9 }, () => ({ ...outcome, outcome: "approved" }))),
    ).toEqual([]);
    expect(
      strategyNotes(Array.from({ length: 10 }, () => ({ ...outcome, outcome: "approved" })))[0],
    ).toContain("not causal proof");
  });
});
