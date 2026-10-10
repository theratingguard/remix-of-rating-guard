# Scan reliability and operational UX

## Evidence, not a forced risky count

Google Places returns at most five reviews per business. Dashboard counts are
assessments across scan runs, not necessarily distinct reviews: repeated scans
can repeatedly analyze the same sample. Zero supported flags is possible.
Negative ratings, legitimate criticism and absent customer records are not
proof of fake reviews. Textless reviews remain Requires review.

The source-only prompt checks verified policy headings, including personal
information, obscene/profane content and off-topic material. Quotes and citations
are validated independently. Prompt version `risk-consensus-v2-retry` prevents
reuse of old classifications as fresh results.

All modes share the validated ballot pipeline:

- One enabled model: explicitly single-model.
- Two: both must support a concern.
- Three: at least two support a concern.
- Disagreement: Requires review, not an operational “no consensus” failure.
- Missing/invalid provider responses: explicit failure, never fabricated ballots.

Retryable network, 429 rate limits, server errors and invalid output receive
up to three attempts. Each classification request times out after 20 seconds.
Authentication/billing/quota failures do not repeatedly spend calls. GPT-only
exhaustion can make one explicitly labelled OpenAI `gpt-4.1-mini` fallback call.
Disabled Claude/Gemini are never called, and one fallback ballot never masquerades
as two independent provider votes. Legal drafting also allows three bounded
attempts, retaining citation/evidence/word-count validation.

## URL resolution

Official `share.google` bridges and `goo.gl/maps` redirects retain HTTPS,
official-host and public-network validation. A CID-only Maps link first reuses
a known, verified business mapping. Otherwise a bounded Chrome session opens
the official Maps CID page and reads its business identity. Only official
Google resource hosts resolving to public addresses are allowed; media is
blocked. Places search **must return the same CID** before reviews are fetched.
An unrelated nearby business is never substituted.

Failures persist their exact reason in Error Center and server logs. Historical
failure percentages do not fall merely because code was deployed; evaluate new
attempts separately and preserve failed history. A successful resolver benchmark
is not proof of an end-to-end scan failure rate below 10%.

## Reports and History

Reports group by business ID/place ID, not name alone. Unknown identities stay
separate. Expand to individual reports. Rows use 14px text and 16px padding.
Copy Link and WhatsApp share an authorized-login URL, not a public PDF. Email
requires server SMTP plus Email Share; confidential PDF attachments cannot be
revoked. PDF downloads retain existing authorization checks.

History searches business, URL, scan ID, report number and exact error text.
Status/risk/date filters, reset and 20-row pagination are available. Dates use
one-line `11 Oct 2026` formatting. Compact failure labels retain full tooltips.
Full scan-list loading paginates beyond REST's default limit, with an explicit
50,000-record bound.

## Settings, errors and dashboard

- Provider test timestamps persist. Google Test performs an actual Places search
  and records success/failure in Super-Admin-only `service_checks`.
- Health distinguishes configuration from a recent test/completed scan, with
  verification dates. Recent evidence is not a promise of current uptime.
- Email toggle is unavailable without SMTP. WhatsApp is browser link sharing,
  requiring no WhatsApp Business API credentials.
- Backup setup opens the authorized Supabase backup configuration. The app does
  **not** claim a verified backup or install an unconfigured backup job.
- Error Center groups by module/code after severity/date/search filters. Every
  error retains its exact message and 24-hour timestamp. Retry only applies to
  the owner's failed real scans. Bulk retries preserve pause; cancelled batches
  cannot retry. Errors without scan context explicitly need integration review.
  “Mark as Resolved” is a manual acknowledgement, not a verified successful retry.
- Top dashboard cards: Total Scans, Flagged Reviews, recorded Approved, and
  decided-case Success Rate. Pending cases are excluded; no decisions means
  Not available. Repeated scan assessments are clearly labelled.
- API/AI warning counts link to Error Center. Settings health cards expand for
  diagnostic detail.

Detailed reports, diagnostics and raw outcomes remain restricted to Super Admin.
Auth implementation, provider secrets and existing paused batches are unchanged.
# Validated assessment persistence

Review risk counts are saved before legal drafting and PDF generation. A later drafting
or PDF failure remains a failed scan, but does not erase already validated assessments
or display zero counts beside flagged review rows. Legal drafting examples themselves
meet the 200-300-word requirement and explicitly preserve legitimate criticism.
