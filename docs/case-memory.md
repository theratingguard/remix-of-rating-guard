# Phase 2 case memory

Case memory contains real sourced reviews and representative-recorded outcomes, not
synthetic training examples. Saving a report with legal assessment synchronizes its
reviews as pending memory. Recording an actual removal outcome synchronizes that
review's decision transactionally. Pending does not mean Google submission.

`saveCaseMemory` accepts a review ID and requires its requested outcome to match the
recorded decision. Neither the client nor a model can turn a scan into an approval.
Seed scans are excluded. Memory and weekly snapshots are Super Admin-only; writes
derive from saved source reports or require the server service role.

`findSimilarCases` ranks up to ten decided cases by exact policy, business type,
evidence strength and text-token overlap. `predictOutcome` returns a cohort estimate,
Wilson 95% interval, complete comparable sample size and similar case IDs. It requires
ten comparable decided reviews with supported evidence. Below that threshold the
probability and interval are null, with "Not enough data". Current, duplicate, future
and pending decisions are excluded. Existing report predictions keep their separate
30-case threshold; the new ten-case engine is exposed through `predictCaseOutcome`.

Weekly `scripts/learn-cases.ts` computes deterministic outcome cohorts, not invented
AI success patterns. Only sufficiently sized cohorts with verified policy headings
can supply strategy notes. No untrusted review text is inserted into a system prompt.
Snapshots expire after eight days. Accuracy remains N/A without prospective held-out
evaluation; historical approval percentages are not prediction accuracy.

Ollama installation, fallback routing and weekly production scheduling are separate
deployment gates. Do not run an 8B model alongside the eight production processes on
the existing 4GB, single-vCPU VPS. Claude and Gemini stay disabled until configured and
verified; fallback must never silently call disabled providers.
