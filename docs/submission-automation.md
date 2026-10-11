# Submission automation boundaries

The MV3 extension is a conservative preparation assistant, not a verified Google
form integration. Load `chrome-extension` unpacked in Chrome developer mode. Its popup
accepts a short-lived existing session JWT, stored only in `chrome.storage.session`.
Privileged operations are popup-only and the report endpoint additionally requires
Super Admin access. Service-role secrets must never be pasted into the extension.

Only source-validated supported drafts with HTTPS Google review URLs are returned.
The popup re-fetches authorized report data before opening a selected review. The
extension never clicks Google Submit and never records a submission just because
a tab opens. Actual submission and response records retain existing explicit
representative confirmation and source-reference requirements.

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
