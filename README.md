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
to `/opt/rating-guard/public/reports/{scanId}.pdf`, and stores the URL in the
owner-scoped `reports.report_data.pdf_url` field. The PDF is public to anyone
with its URL; the UI explicitly discloses this before export. R2 is not used.
Seed reports download locally only. Printing does not imply a PDF was saved.

Create the VPS reports directory with mode 755 and ownership `ratingguard`.
Files are 644 for Nginx reads despite the service's restrictive umask; directory
listing is disabled. Ignore generated PDFs in Git. Keep `/reports/{id}` proxied
to the app; only UUID `.pdf` URLs use the Nginx static handler, with PDF MIME,
inline disposition and `nosniff`. Set `client_max_body_size 36m` for PDF uploads
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
that reports are automatically public to anyone with the PDF URL.
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
Nginx's UUID-only PDF location must permit `_selected` alongside `_evidence`;
keep application `/reports/{scanId}` routes proxied. Selected snapshots also
have business-folder and shared copies and the same 90-day retention. Selected
PDF sharing is labeled separately from the full automatic report.

### Legal Expert Mode

New automatic PDFs include Legal Expert Analysis and a separate
`{scanId}_legal.pdf` downloadable assessment. Older reports can generate the
module in place without changing login or credentials. Selected PDFs also
include legal assessments only for selected reviews. Nginx's UUID-only PDF
route must permit `_legal` in addition to `_selected` and `_evidence`.
Serve `_legal.pdf` with `Content-Disposition: attachment` so the legal-request
button is a download, even in browsers that ignore the HTML `download`
attribute. Full and selected report URLs may retain inline PDF viewing.
The legal download button appends `?download=legal-v1` to avoid previously
cached inline headers when upgrading existing reports.

Flagged (high/medium) reviews receive a structured AI assessment with
validated review IDs, verbatim evidence, an allowlisted Google policy heading
and a 200-300 word formal draft when supported. Invalid evidence, citations,
length triggers one logged, bounded correction pass with measured validation
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
