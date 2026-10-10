# Phase 1: Predictions, bulk import and insights

## Historical removal prediction

Each newly generated full/legal/selected PDF and legal report assessment stores a
`history-cohort-v1` prediction snapshot. Existing reports can be upgraded using
**Generate / Upgrade Legal Expert Analysis**.

`removal_history` is a security-invoker view of existing `removal_outcomes`, not a
second editable dataset. It includes only recorded approved/rejected decisions,
their response duration and explicitly recorded evidence strength. Pending cases
are excluded. Existing records without evidence strength remain unavailable.
Submission recording stores the assessed evidence component (0–20 scaled to
0–100), not the overall readiness score.

The estimate needs at least **30 unique comparable decided reviews**, matching
policy, business type and a 20-point evidence band. It excludes the review being
assessed. It displays approval frequency, sample size, a 95% Wilson interval and
median response days. Probability bands are 80/60/40; even 80–100% is **not**
labelled “almost certain.” This is observational feedback, not model retraining,
individual calibration, independent Google verification or a guarantee.

No cases, missing evidence/type, or unsupported policy concerns produce **Not
estimable**, never a fabricated percentage. Reviewer-wide history and complete
timing data are unavailable from Places. Existing readiness/advisory scores are
separate and unchanged. Raw outcomes and predictions retain Super Admin privacy.

## Bulk CSV / Excel

The Bulk tab supports paste, PDF and CSV/Excel (`.xlsx`, not legacy `.xls`).
Columns: `Business Name`, `City`, `Google Maps URL`. Common header variants and
UTF-8 BOM are accepted. URL takes priority; without URL both name and city are
required. Quoted CSV commas, multilingual names, XLSX hyperlinks and rich text
are supported. Formulas and invalid rows reject the entire import with row
numbers. No silent partial import or automatic scan start.

Limit: **5,000 inputs per batch**, **10 MB** per imported file; Excel requires
one non-empty sheet and at most 50 columns. PDF retains its 40-page limit.
Imported data is previewed in the editable textarea and duplicates are counted
before the existing background queue starts. Pause/Resume/Cancel and persisted
progress remain unchanged. Queue reads paginate beyond Supabase's default row
limit; result CSV includes private Report URLs and blanks unavailable metrics.
Formula-safe CSV export is preserved.

Configured per-user daily limits and the operational daily cap still apply.
Increasing import capacity does **not** raise daily allowance or exceed the
shared **10 starts/minute** ceiling. Current 1,000/day can accept 1,000 on a fresh
day, not 1,000 plus already admitted jobs.

ExcelJS is used instead of `xlsx`; it supports the required modern workbook
format with typed cells, formula rejection and explicit worksheet validation.

## Smart Alerts

Super Admin Dashboard shows:

- Policy distribution among flagged reviews from the latest fetched sample per
  business scanned in the last seven days. The denominator is shown. It is not
  a claim about all reviews published that week.
- Type-specific policy trends with at least five fetched flagged reviews.
- Today's observed review/flag counts (UTC) and matching-text leads within each
  fetched business sample. Negative ratings or similarity do not prove abuse.
- Comparison of **two explicitly selected, actually scanned businesses** using
  last recorded Google rating/review counts. No invented competitor relationship,
  live monitoring or reviewer-wide behavior.
- Weekly decision counts by response date, pending requests submitted this week,
  and on-demand weekly email **only** when SMTP and Email Share are configured.
  Confidential insights send only to the designated Super Admin. SMTP acceptance
  is not confirmed delivery. No automatic weekly email scheduler is claimed.

Alerts refresh every minute. Loading/query/SMTP failures are explicit. The
server functions and SQL RPC both require Super Admin access. Email is disabled
when SMTP is absent; dashboard insights do not require sending email.

## Deferred

Chrome form-filling extension and authenticated Google decision polling are
Phase 2. Checking whether a review is visible does not prove a Google removal
approval. Mobile app, public API, white-label and other bonus requests remain
later phases. Auth implementation and existing provider keys are untouched.
