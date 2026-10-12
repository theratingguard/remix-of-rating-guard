const status = document.getElementById("status");
const scanIdInput = document.getElementById("scanId");
const reviewSelect = document.getElementById("review");
const draftInput = document.getElementById("draft");
const submittedAtInput = document.getElementById("submittedAt");
let report;

function localDateTimeNow() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function selectedReview() {
  return report?.reviews.find((review) => review.reviewId === reviewSelect.value);
}

function showDraft() {
  const review = selectedReview();
  draftInput.value = review
    ? `${report.business}\n${review.reviewUrl}\n${review.policy}\n${review.request}`
    : "";
}

async function send(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (result?.error) throw new Error(result.error);
  return result;
}

function action(id, callback) {
  document.getElementById(id).addEventListener("click", async () => {
    try {
      await callback();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "The action failed.";
    }
  });
}

reviewSelect.addEventListener("change", showDraft);
submittedAtInput.value = localDateTimeNow();

action("connect", async () => {
  const token = document.getElementById("token").value.trim();
  if (!token) throw new Error("Enter your current short-lived user session token.");
  const result = await send({ type: "connect", token });
  document.getElementById("token").value = "";
  status.textContent = `Connected as ${result.email ?? "authorized user"}.`;
});

action("disconnect", async () => {
  await send({ type: "disconnect" });
  report = undefined;
  draftInput.value = "";
  reviewSelect.replaceChildren();
  scanIdInput.value = "";
  status.textContent = "Disconnected. Session token and prepared review were cleared.";
});

action("load", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let scanId = scanIdInput.value.trim();
  if (!scanId && tab?.url) {
    const url = new URL(tab.url);
    const match = /^\/scan-report\/([0-9a-f-]{36})\/?$/i.exec(url.pathname);
    if (url.origin === "https://ratingguard.online" && match) scanId = match[1];
  }
  if (!scanId) throw new Error("Open a Rating Guard scan report or enter its scan ID.");
  report = await send({ type: "report", scanId });
  scanIdInput.value = report.scanId;
  reviewSelect.replaceChildren(
    ...report.reviews.map((review) => {
      const option = document.createElement("option");
      option.value = review.reviewId;
      option.textContent = `${review.policy}: ${review.evidence.slice(0, 80)}`;
      return option;
    }),
  );
  showDraft();
  status.textContent = `${report.user.email ?? "Authorized user"} · ${report.business} · ${report.reviews.length} supported draft(s).`;
  if (!report.reviews.length) status.textContent += " No reportable draft is available.";
});

action("open", async () => {
  const review = selectedReview();
  if (!report || !review) throw new Error("Load a report and choose a supported review.");
  await send({ type: "prepare", scanId: report.scanId, reviewId: review.reviewId });
  status.textContent =
    "Exact Google Maps review opened. Choose its review menu → Report review, verify the reason, and submit manually.";
});

action("copy", async () => {
  if (!selectedReview()) throw new Error("Load a report and choose a supported review.");
  await navigator.clipboard.writeText(draftInput.value);
  status.textContent = "Draft copied. Review the exact facts before submitting.";
});

action("record", async () => {
  const review = selectedReview();
  if (!report || !review) throw new Error("Load a report and choose a supported review.");
  if (!document.getElementById("confirmed").checked)
    throw new Error("Confirm that you actually submitted the report in Google Maps.");
  const date = new Date(submittedAtInput.value);
  if (!Number.isFinite(date.getTime())) throw new Error("Enter the actual submission date.");
  const result = await send({
    type: "record",
    reviewId: review.reviewId,
    submittedAt: date.toISOString(),
    verificationReference: document.getElementById("reference").value,
    confirmed: true,
  });
  status.textContent = `Actual submission recorded as ${result.outcome}. It now appears under Submissions; Google status is not automatically verified.`;
});
