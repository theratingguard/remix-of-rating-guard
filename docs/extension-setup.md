# Rating Guard Chrome Extension

## Install locally (unpacked)

1. Use current Google Chrome and sign in to Rating Guard.
2. Open `chrome://extensions`, turn on **Developer mode**, and choose **Load unpacked**.
3. Select the `chrome-extension` folder from this repository.
4. Pin **Rating Guard Submission Assistant** from Chrome's Extensions menu.
5. Open an authorized scan report at `https://ratingguard.online/scan-report/<scan-id>` and choose **Auto Report via Extension**.
6. Choose a source-validated review and **Open exact review in Google Maps**.
7. In Google Maps, inspect the review, open its three-dot menu, choose **Report review**, select the appropriate Google reason yourself, inspect the draft, and submit using Google's own controls.
8. After actually submitting, open the extension popup, reload the scan report if needed, enter the actual submission date and Google confirmation/reference, confirm the declaration, and choose **Record actual submission**.
9. Verify the entry on `https://ratingguard.online/submissions`.

The app-to-extension bridge uses the current signed-in user's short-lived Supabase session only when the authorized user clicks the report-page button. The extension verifies that session against Rating Guard before retrieving data; its copy is held in `chrome.storage.session` and cleared when the browser session ends or the user disconnects. Never paste a service-role, publishable API key, password, or unrelated token into the extension.

## What the extension does (and does not do)

- Requires a verified Rating Guard session and Super Admin report access, consistent with private report access controls.
- Retrieves only supported report drafts whose quoted evidence exactly exists in that scan's saved Google Places review data.
- Opens the individual review's Google Maps URL, and exposes a copy-only request draft after the exact business and evidence are visible on the page.
- Does **not** submit reports, choose a Google policy reason, or automatically fill/click Google's reporting controls. Google Maps' review-reporting interface is dynamic and does not expose a stable universal form with the requested business/review/policy fields. The user must use the review's **Report review** menu and submit manually.
- Records a `pending` submission only after an explicit user confirmation, a past submission timestamp, and a reference are provided. A saved record is a representative's attestation, not proof that Google received the request or a way to poll Google's decision.
- Does not use the Google Business Profile API.

## Chrome Web Store

This repository contains an unpacked development extension; it has not been submitted to or published on the Chrome Web Store. Store publication requires a developer account, final privacy disclosures, store review, and a signed release package.
