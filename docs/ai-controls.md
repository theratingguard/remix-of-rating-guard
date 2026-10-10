# AI control panel

Only the designated Super Admin can change Settings, view persisted provider health,
or make paid model tests. Keys remain in the VPS environment; they are never sent
to the browser. Application settings are validated and cached server-side for
60 seconds. Saving invalidates the current process's cache immediately; already
running work and other processes may use the previous configuration for up to a minute.

## Models

- Three enabled providers require two supported positive votes.
- Two enabled providers require both positive votes.
- One enabled provider is explicitly a single-model assessment, not consensus.
- Multi-Model OFF uses the first enabled provider: GPT, then Claude, then Gemini.
- Disabled providers are never called. Enabled provider failures fail the scan
  rather than silently falling back. All providers OFF produces an explicit error.
- Legal generation, selected legal requests and appeal drafts currently require
  GPT enabled as well as Legal Expert Mode enabled.

Test buttons make small real provider requests and persist status, time and test
timestamp. Billing does not mean the provider is active. GPT's test cost estimate
uses returned token usage and published GPT-4o input/output rates ($2.50/$10 per
million); it excludes taxes/discounts and is not an invoice. Other providers show
unavailable estimates until verified usage/pricing is available.

## Features and limits

Bulk OFF blocks new batches and pauses worker claims without losing queued jobs.
Auto-PDF OFF keeps completed report data and permits manual export. Legal OFF
still permits basic risk analysis/PDFs. Email ON additionally requires verified
SMTP configuration. WhatsApp sharing opens a private-report link, not automatic
delivery. Appeal Tracking OFF blocks outcome/appeal writes and hides analytics.

Daily bulk admission uses UTC days; single scans use rolling hours. Admitted
attempts count even if they later fail. The shared per-minute limit covers
interactive starts and background claims; maximum 10/minute. Existing operational
queue safety caps also remain in effect. Retention is 1–90 days; shorter settings
deny expired downloads immediately. The existing 03:00 cleanup reads the same
setting, aborts without deleting on invalid/unavailable settings, and deletes
only expired private PDF artifacts. Downloaded or emailed copies cannot be revoked.

Apply all three AI-settings migrations before deploying. Database regression fixtures
in `supabase/tests/ai-control-settings.sql` run in a rolled-back transaction.
