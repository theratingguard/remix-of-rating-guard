# Submission automation boundaries

The MV3 extension is a conservative preparation assistant, not a verified Google
form integration. Load `chrome-extension` unpacked in Chrome developer mode. Its popup
accepts a short-lived existing session JWT, stored only in `chrome.storage.session`.
Privileged operations are popup-only and the report endpoint additionally requires
Super Admin access. Service-role secrets must never be pasted into the extension.
The extension rejects service-role/admin/anonymous JWTs, expired sessions, tokens
without a UUID subject and tokens expiring more than 24 hours away before storage.
These are shape checks only; signature and Super Admin authorization are always
verified by the backend. Reconnection and expired sessions clear prepared evidence.

Only source-validated supported drafts with HTTPS Google review URLs are returned.
The popup re-fetches authorized report data before opening a selected review. The
extension never clicks Google Submit and never records a submission just because
a tab opens. Actual submission and response records retain existing explicit
representative confirmation and source-reference requirements.
The popup exposes a read-only draft, an official status/appeal-tool opener bound
to the selected authorized review, and a return-to-report action for actual
submission recording. The reason-only initial Google form remains manual.

Google's initial report flow generally chooses a reason, not a generic business/
evidence text form. The field adapter requires the business name and exact review evidence visibly
present in Google's main content, exact recognized labels, and the original
prepared tab. It refuses mismatched reviews, reason-only forms and unknown policy
options. Automated DOM fixtures verify text filling and no final Submit click;
live field adapters and status capture require an authorized Business Profile. The current signed-in account returns "No location
found", so Google form autofill and actual submission have not been verified.

The six-hour server job checks local pending submissions and creates daily-deduplicated
in-app follow-up reminders. It does not query or infer Google moderation decisions:
Places exposes a small review sample, not report status. `last_checked` is a local
follow-up timestamp. Decisions are synchronized only from recorded outcomes; success
rates exclude pending cases. Email and WhatsApp delivery are not implemented.

Rejection notifications link to existing source-validated AI appeal drafting and
Google's one-time appeal workflow. No new evidence is fabricated. The Submissions
page reuses existing outcome analytics and appeal controls, shows recorded submissions
and recent in-app events, and remains Super Admin-only.

## Deployment verification (11 October 2026)

- Applied migration after a rollback-only SQL test verified status synchronization,
  five distinct notification events, daily reminder idempotency, rejection/future
  guards and ordinary/anonymous privacy. Test submissions were rolled back; there
  are zero actual recorded submissions and notifications.
- Local and VPS initial deployment: 232 tests passed in 47 files, type-check and app/worker builds
  passed; lint has zero errors and ten existing warnings.
- `/submissions` is live; authenticated report-readiness UI returned
  "The Hudson: 0 eligible review drafts". Normal reviews are not offered for reporting.
- Production extension endpoint: authorized 200, anonymous 401, ordinary user 403.
  Ordinary-user table reads returned no private records.
- Installed and loaded the unpacked MV3 extension in isolated Chrome for Testing.
  Its real service worker fetched the authorized report, rejected an opaque
  server-secret-shaped token and cleared session data on disconnect. This is not
  an installation in the client's shared browser.
- Enabled `ratingguard-submission-followup.timer` persistently. Schedule:
  00:00, 06:00, 12:00, 18:00 UTC. First service run exited successfully with
  `checked: 0, google_polled: false`. Eight PM2 processes remain online; Redis responds PONG.
- SMTP and WhatsApp credentials are not configured. Only in-app event persistence
  is currently available.

Phase 3 is not fully complete: live Google field filling, actual submission,
Google confirmation/status capture and a live rejected-case appeal still require
an authorized Business Profile/account and a genuinely reportable review.
No Google report or appeal was submitted during verification.

Further hardening adds seven session-token guard tests (239 tests in 48 files
locally), a read-only popup evidence draft, an explicit official status/appeal tool
opener and actual-submission handoff. A failed dashboard refresh now surfaces an
error instead of silently showing stale submission counts. Local Windows temporary
file rename/copy-lock failures were transient; test/build retries passed unchanged.

The existing AI appeal generator is explicitly Super Admin-authorized and is not
silently bypassed by the service-role follow-up job. Rejections create in-app
appeal-needed events; the authorized dashboard generates the validated draft.
Unattended background AI drafting is not enabled.
