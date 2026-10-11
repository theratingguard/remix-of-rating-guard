const status = document.getElementById("status");
let report;
async function send(message) {
  const result = await chrome.runtime.sendMessage(message);
  if (result.error) throw new Error(result.error);
  return result;
}
function action(id, callback) {
  document.getElementById(id).addEventListener("click", async () => {
    try {
      await callback();
    } catch (error) {
      status.textContent = error.message;
    }
  });
}
action("connect", async () => {
  const token = document.getElementById("token").value.trim();
  if (!token) throw new Error("Enter your current session token.");
  await send({ type: "connect", token });
  document.getElementById("token").value = "";
  status.textContent = "Session token stored. Load a report to verify access.";
});
action("disconnect", async () => {
  await send({ type: "disconnect" });
  report = undefined;
  document.getElementById("review").replaceChildren();
  status.textContent = "Disconnected; token and prepared evidence cleared.";
});
action("load", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = new URL(tab.url);
  const match = /^\/reports\/([0-9a-f-]{36})$/.exec(url.pathname);
  if (url.origin !== "https://ratingguard.online" || !match)
    throw new Error("Open a Rating Guard report page first.");
  report = await send({ type: "report", scanId: match[1] });
  const select = document.getElementById("review");
  select.replaceChildren(
    ...report.reviews.map((review, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${review.policy}: ${review.evidence.slice(0, 100)}`;
      return option;
    }),
  );
  status.textContent = `${report.user.email}: ${report.business}. ${report.reviews.length} supported review drafts.`;
});
action("prepare", async () => {
  const review = report?.reviews[Number(document.getElementById("review").value)];
  if (!review) throw new Error("No source-validated reportable review selected.");
  await send({ type: "prepare", scanId: report.scanId, reviewId: review.reviewId });
  status.textContent =
    "Google review opened. Choose Report; inspect every field and submit manually.";
});
