# Rating Guard Remix

Rating Guard Remix helps authorized users review publicly available Google
Business Profile reviews, analyze potential policy risks, and save reports.

## Development

This project uses TanStack Start, React, and Vite.

```sh
npm install
npm run dev
```

Available validation scripts:

```sh
npm run build
npm run lint
npm test
```

## Environment

Copy `.env.example` to `.env` and provide credentials for the authorized
Supabase project and any enabled integrations. Use only a Supabase publishable
key in browser-visible `VITE_*` variables. Keep server-side secret keys out of
browser variables, source control, and logs.

Set `VITE_PUBLIC_APP_URL` only to a production domain that has been verified
and authorized for this deployment.

## Deployment

The production deployment target and runtime entry point must be configured
for the chosen host. Do not assume a Vercel or Cloudflare deployment target.

Production uses Nitro's Node server behind Nginx/systemd. Build with
`npm run build`, then run `npm start`. Preserve private environment files and
the previous output before replacing a deployed build.

Apply the application baseline only to a validated empty database. Existing
deployments apply the additive `20261010130000_content_security.sql` migration:
it preserves existing homepage content, initializes a missing row, restricts
draft reads to administrators, and exposes only published content through
`get_published_site_content()`. Never reset existing data to rerun the baseline.
Use `supabase/tests/ownership.sql` and `supabase/tests/content-security.sql`
for transaction-only policy tests; no fixtures should survive.

Homepage previews use the protected `/homepage-preview` route. Content editing
requires an explicitly authorized admin role, not just a signed-in account.
Google link admission accepts HTTPS Maps links on the enumerated Google domains
and official short-link hosts; unsupported country domains must use google.com
or an official short link. Reviews are the up-to-five reviews supplied by Places,
not a full-review export.
Full `/maps/place/NAME/` links retain their business name and `!3dLAT!4dLNG`
coordinates even when they contain a hexadecimal CID. Text search must return
the same CID before that business is selected. CID-only review-share links
require an existing owner-scoped business mapping: first scan the full business
place link, then reopen its review-share links. Coordinate-only links do not
select an arbitrary nearby business.
Embedded PostgREST queries specify the single-column foreign-key relationship
explicitly; owner-consistency composite foreign keys must remain enabled and
must not make dashboard, report or review queries ambiguous.

Completed live reports offer **Download PDF** and a separate **Print / Save PDF**
action. Live PDF generation runs server-side using Puppeteer/Chromium, inline
styles and system fonts, without browser rendering, external requests or
JavaScript. It loads owner-scoped saved reviews and AI assessments and preserves
unresolved-review warnings. Download validates ownership and the PDF, saves it atomically
to `/opt/rating-guard-private/reports/{scanId}.pdf`, and stores its identifier in the
owner-scoped `reports.report_data.pdf_url` field. Legacy PDF URLs are retained
as artifact identifiers, not public download endpoints. Downloads now require
the designated Super Admin (theratingguard@gmail.com). R2 is not used.
Seed reports download locally only. Printing does not imply a PDF was saved.

Create `/opt/rating-guard-private/reports` with mode 700 and ownership `ratingguard`.
Files are mode 600 and must never be copied into `public` or build output.
Ignore generated PDFs in Git. Keep `/reports/{id}` proxied to the app;
Nginx denies every legacy `/reports/*.pdf` path, including shared/business copies.
Authenticated PDF transport returns validated bytes with private/no-store headers.
Set `client_max_body_size 36m` for PDF uploads
(24 MB bytes, base64 encoded). Do not copy generated PDFs into deployment
artifacts or remove them on rebuild. Install Chromium with Puppeteer's browser
installer and OS dependencies; set `PUPPETEER_CACHE_DIR` to a persistent directory
readable by the `ratingguard` service. Give Chromium a writable private HOME
and XDG config/cache directory outside `/home` (for example,
`/opt/ratingguard-chromium-runtime`) because the service uses `ProtectHome`.
The service's `NoNewPrivileges` setting
requires Chromium's no-sandbox mode: only escaped, server-built HTML is rendered,
with scripting and all network requests disabled. One render per process is
admitted; launch/content/PDF operations have explicit timeouts and browser cleanup.
Apply `20261010153000_vps_report_url.sql`
additively; it retains the separate service-only `scan_history` permissions.

Live scan completion now waits for server-generated PDFs to be saved and indexed;
`REPORT_READY` is emitted only afterward. PDF failure fails the scan explicitly,
not an untracked fire-and-forget background job. On a live scan, the UI explains
that reports are private and require authorized login.
Canonical `/reports/{scanId}.pdf` links remain compatible; copies are saved under
`{businessId}/{scanId}.pdf` and `shared/{scanId}.pdf`, with an AI-evidence appendix
`{businessId}/{scanId}_evidence.pdf`. Review assessments remain advisory.

Report and history pages expose saved PDF links for 90 days. Install
`scripts/cleanup-reports.sh` as a daily 03:00 root cron job to remove only PDF
files older than 90 days, leaving database scan history intact. Expired PDFs can
be regenerated from saved data. This is age-based retention, not the alternative
1 GB eviction policy. Backups have independent retention.

Sharing supports Copy Link, WhatsApp, direct Save PDF and authenticated Email
Report. WhatsApp opens a prefilled message; it never sends automatically.
Save PDF reuses a saved URL and never regenerates unnecessarily. Browsers control
download destinations and "ask where to save"; an app cannot override that setting.
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM must be set server-side,
using an authorized App Password or provider credential, never in Git/frontend.
SMTP acceptance is not proof of inbox delivery. Email is explicitly unavailable
when SMTP is unconfigured; owner access is checked and attachments are read from
validated local report filenames, never fetched from arbitrary URLs.

Manual review selection is available after a completed scan and on its report
page: All/1-star/Clear controls, individual checkboxes and filters operate on
the up-to-five official API reviews. Apply `20261010170000_review_selection.sql`
additively; ownership RLS stays unchanged. Selection is persisted when a
selected report is generated. A selected report uses only the chosen reviews
and saves a separate `{artifactId}_selected.pdf`, request assessments and IDs in
owner-scoped report metadata; the automatic full PDF is preserved.
Selecting a negative review does not make it a violation. Requests without a
supported existing AI concern and an exact evidence quote are downgraded to
insufficient evidence, not fabricated allegations. Reports never submit to
Google automatically. Original API `review_uri` is preferred; absent URLs
link to the business Maps page or a clearly labeled Google search, not an
invented direct review URL.
Selection flags and selected request metadata are committed together by the
owner-scoped `save_selected_report` transaction. Each selected generation has
a fresh artifact ID, preserving previous shared snapshots even on retries.
Single scans also support business-name search (include city). The user must
choose a candidate by name and address; the chosen exact place-ID URL runs
through the existing scan flow. Search never silently scans an arbitrary match.
Keep application `/reports/{scanId}` routes proxied. Selected snapshots also
have business-folder and shared copies and the same 90-day retention. Selected
PDF sharing is labeled separately from the full automatic report.

### Legal Expert Mode

New automatic PDFs include Legal Expert Analysis and a separate
`{scanId}_legal.pdf` downloadable assessment. Older reports can generate the
module in place without changing login or credentials. Selected PDFs also
include legal assessments only for selected reviews. All variants download
through the same authenticated, ownership-checked byte transport, not static
Nginx URLs. Previously selected snapshots must be regenerated once to obtain
a server-registered ownership binding; editable report metadata is not proof
that a selected artifact belongs to its requester.

Flagged (high/medium) reviews receive a structured AI assessment with
validated review IDs, verbatim evidence, an allowlisted Google policy heading
and a 200-300 word formal draft when supported. The copied draft must itself
include the exact evidence excerpt and verified policy heading, not just
the surrounding PDF fields. Invalid evidence, citations or length triggers
one logged, bounded correction pass with measured validation
feedback; a second invalid result or provider failure stops publication
explicitly. Non-flagged reviews
receive an insufficient-evidence assessment, not invented allegations.
Policy headings were verified against Google's prohibited/restricted content
page on 2026-10-10: Fake Engagement, Rating Manipulation, Advertising &
solicitation, Harassment, Hate speech, and Offensive content. Four editable templates use
these verified headings; Spam maps to Advertising & solicitation. The
Prohibited Content template starts with Harassment; assessments may also cite
Hate speech or Offensive content only when substantiated by the source review.

This is AI-assisted policy analysis, not legal advice or a lawyer's opinion.
Removal likelihood is an uncalibrated AI score, not a validated probability;
unsupported cases display "Not estimable (0 score)". No defamation, false-light,
consumer-protection or platform-liability violation is asserted without
verified facts and applicable jurisdiction. Supporting documents are items
to obtain, never a claim that attachments already exist. Google independently
decides removal; the software never submits a request automatically.

### Bulk scans, stars and removal bands

Bulk input supports up to 500 lines of Google Maps URLs or business names with
city. Copy-paste and text-PDF modes share an editable preview. Browser PDF.js
extracts selectable text locally (10 MB/40-page limits); no third-party upload.
Image-only/scanned PDFs are explicitly unsupported. Names are scanned only
when Google returns exactly one candidate; ambiguous names fail with a
request for an exact Maps URL, never a guessed match.

Apply `20261010200000_bulk_controls.sql` before deployment. The existing queue
is persisted in Supabase and run by `scripts/run-scan-worker.mjs`, invoked
through a systemd timer using a private `SCAN_WORKER_SECRET`. Set
`SCAN_WORKER_SCHEDULED=true` only after validating the scheduler. The
service-only claim transaction locks shared state and admits one job every
six seconds (at most 10 starts/minute, including retries), even across workers.
Sequential processing avoids simultaneous Chromium renders. Owner-scoped
pause/resume/cancel stops new jobs, not an already-running provider request.
Polling shows individual failures/cancellations, fetched stars and advisory
removal bands; CSV fields neutralize spreadsheet formulas.

The VPS uses `ratingguard-scan-worker.service` and its six-second
`OnUnitInactiveSec` timer. Both the app and worker load the root-readable
`/etc/ratingguard-worker.env` for the worker secret, scheduling flag and
authorized Supabase server key. Keep this file mode 600 and out of Git.
Stop the timer and wait for the current worker before replacing a build.

Star distribution covers fetched reviews only, normally up to five out of the
business's total. The full distribution requires the client's Google Business
Profile. Removal bands use supported legal-assessment scores: red 70-100,
orange 40-69, yellow 0-39. Unsupported/unassessed reviews are yellow and not
estimable. Scores remain uncalibrated AI estimates, never removal guarantees.
PDFs include the breakdown, color-coded details and a manual prioritized
action plan without invented timelines.

### Removal-quality workflow

Apply `20261010230000_removal_quality_workflow.sql` before deploying this upgrade,
then run `supabase/tests/removal-quality.sql` (transaction-only fixtures).
Outcome and appeal records are Super Admin-only; no test outcomes are seeded
into production. The dashboard shows actual manually recorded submissions,
approval/rejection/pending counts, policy/category groups and seven-day
follow-ups. A submitted date and case reference are required. Pending cases
are excluded from the decided-case success denominator.

`REVIEW_ANALYSIS_MODE=single` (default/unset) preserves existing OpenAI scans.
For optional three-provider analysis, configure `REVIEW_ANALYSIS_MODE=three`,
or `MULTI_MODEL_ENABLED=true`, together with
`ANTHROPIC_API_KEY` and `GEMINI_API_KEY` in the private server environment;
retain the existing `OPENAI_API_KEY`. Models are GPT-4o, Claude Sonnet 4.6 and
Gemini 3.8 Flash. All three independently receive the original source; two
validated positive votes flag a concern. Every positive vote requires an
exact source quote and an allowed policy heading. Missing keys, invalid
responses or provider failures explicitly fail the analysis; no silent
single-model fallback or fabricated consensus. Cache versions separate modes.
Provider HTTP statuses and elapsed milliseconds are logged without credentials
or review text; successful consensus ballots preserve provider timings in report evidence.
This mode costs three provider requests per fresh review batch and is **not
live-verified** until all credentials are configured. Model agreement is
not proof of a violation or a calibrated removal probability.

New full/legal/selected PDFs include a five-component evidence-readiness
score and limited-sample evidence findings. Unknown precedent, jurisdictional
legal grounds and removal history remain unavailable, not invented scores.
Text-only policy concerns currently establish at most 30/100 (20 policy
clarity plus 10 source-quote evidence), assessed across 2/5 components.
Readiness colors use 90/70/50 thresholds, separately from the existing
uncalibrated removal bands; no "almost certain" label is used.
An upgrade button regenerates older reports with these sections.

Duplicate text/token overlap and same-day timing cover only the fetched
sample. They do not prove fake accounts or bot authorship. Places does not
provide reviewer-wide history, competitor activity, renovation records,
Google decision precedents or a complete review population. Obtain authentic
supporting records and qualified legal review separately.

Policy groups with at least ten manually recorded decisions provide aggregate
strategy context to future legal drafting. This is contextual feedback, not
model fine-tuning, causal evidence or business-specific removal history.
Only aggregates are added; policy applicability must still be supported by
the original review.

Google's [Reviews Management Tool](https://support.google.com/business/answer/4596773)
supports a **one-time appeal** after rejection. Seven days schedules a local
status-check reminder, not automatic rejection detection. Recording a new rejection
attempts an OpenAI appeal draft automatically; the dashboard also provides an
explicit retry button. This requires an existing source-validated policy concern,
exact quote and verified policy heading. Structured output validation enforces
200-300 words and verbatim citation/evidence before saving; unsupported cases
fail explicitly instead of inventing grounds. Failure preserves the recorded
decision and displays a separate draft error. The optional draft adaptation
reuses the original submitted request without an AI call. The database prevents a second
appeal submission timestamp. Google status polling, automatic Google
submission, legal notices, background email and WhatsApp delivery are not
implemented or claimed; no supported Google status integration or messaging
credentials are currently configured. The UI refreshes local database records
every minute and links to official status/support tools.

### Private report deployment

Apply `20261010210000_private_reports.sql`, followed by
`20261010220000_super_admin_only_reports.sql`, and run
`supabase/tests/private-reports.sql` (transaction-only fixtures).
Option B designates only `theratingguard@gmail.com` as Super Admin.
Every other signed-in account, including report owners and existing application
admins, receives summary-only access. A unique index permits one Super Admin
principal; the access function also verifies the designated account's email.

Authorized operators assign franchise/reseller principals through trusted
database administration, never browser writes. All signed-in users can see
business-name/total-review summaries from `private_report_summaries()`;
restrictive RLS denies scans, reviews, analyses, actions, reports, events, jobs,
errors and audit details. `report_access` automatically indexes report ownership.
Public PDF locations and build copies must be removed, and the CDN cache purged.
New PDFs are confidential, mode 600, outside the web root.
Links now point to the private report page and require authorized login.
Previously downloaded copies/browser caches cannot be recalled. A Super Admin who
emails an attachment deliberately shares an external, non-revocable copy.

The report's **Report Google** button opens the saved business Google Maps URL
in a new tab. If no Maps URL is saved, it opens Google's review-reporting help
page at `https://support.google.com/business/answer/4596773`. Opening this link
does not automatically submit a review report to Google.

Configure `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `SCAN_WORKER_SECRET`
only on the server. Bulk admission remains disabled unless
`SCAN_WORKER_SCHEDULED=true` is set after a real scheduler has been verified.
Do not claim background progress based on an open browser or a configured key.
Unconfirmed users must complete email verification; the login screen offers
the supported confirmation-resend operation without bypassing verification.
