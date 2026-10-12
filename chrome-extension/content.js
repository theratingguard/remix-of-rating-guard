(() => {
  const match = /^\/scan-report\/([0-9a-f-]{36})\/?$/i.exec(location.pathname);
  if (!match || location.origin !== "https://ratingguard.online") return;

  function notify(type, detail = {}) {
    window.postMessage(
      { source: "rating-guard-extension", type, scanId: match[1], ...detail },
      location.origin,
    );
  }

  function makeButton(text, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", action);
    return button;
  }

  function openAssistant() {
    const existing = document.getElementById("rating-guard-extension-panel");
    if (existing) {
      existing.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const panel = document.createElement("section");
    panel.id = "rating-guard-extension-panel";
    panel.setAttribute("aria-label", "Rating Guard extension assistant");
    Object.assign(panel.style, {
      position: "fixed",
      zIndex: "2147483647",
      inset: "auto 20px 20px auto",
      width: "min(440px, calc(100vw - 40px))",
      maxHeight: "80vh",
      overflow: "auto",
      padding: "16px",
      border: "1px solid #0f766e",
      borderRadius: "12px",
      background: "#fff",
      color: "#111827",
      boxShadow: "0 8px 32px #0005",
      font: "14px/1.5 system-ui,sans-serif",
    });
    const title = document.createElement("h2");
    title.textContent = "Rating Guard · Google Maps report assistant";
    const status = document.createElement("p");
    status.textContent = "Checking your authorized session…";
    panel.append(title, status);
    document.body.append(panel);
    notify("assistant-ready");

    chrome.runtime
      .sendMessage({ type: "report", scanId: match[1] })
      .then((report) => {
        if (report.error) throw new Error(report.error);
        status.textContent = report.reviews.length
          ? `${report.business}: ${report.reviews.length} supported draft(s). Google decides whether a review violates policy.`
          : "No source-validated reporting drafts are available for this report.";
        if (!report.reviews.length) return;

        const select = document.createElement("select");
        select.setAttribute("aria-label", "Supported flagged review");
        for (const review of report.reviews) {
          const option = document.createElement("option");
          option.value = review.reviewId;
          option.textContent = `${review.policy}: ${review.evidence.slice(0, 90)}`;
          select.append(option);
        }
        const evidence = document.createElement("p");
        const draft = document.createElement("textarea");
        draft.readOnly = true;
        draft.rows = 6;
        draft.style.width = "100%";
        draft.setAttribute("aria-label", "Verified report draft");
        const selected = () => report.reviews.find((row) => row.reviewId === select.value);
        const update = () => {
          const review = selected();
          evidence.textContent = review
            ? `Exact source quote: “${review.evidence}” · ${review.policy}`
            : "";
          draft.value = review?.request ?? "";
        };
        select.addEventListener("change", update);
        update();

        const open = makeButton("Open exact review in Google Maps", async () => {
          try {
            await chrome.runtime.sendMessage({
              type: "prepare",
              scanId: report.scanId,
              reviewId: select.value,
            });
            status.textContent =
              "Exact review opened. In Google Maps, open the review menu and choose “Report review”. Review the policy reason and submit manually.";
          } catch (error) {
            status.textContent = error.message;
          }
        });
        const copy = makeButton("Copy request draft", async () => {
          try {
            await navigator.clipboard.writeText(draft.value);
            status.textContent =
              "Draft copied. Review the facts and paste only where appropriate in Google's review reporting flow.";
          } catch {
            status.textContent = "Clipboard unavailable. Select and copy the draft manually.";
          }
        });
        const close = makeButton("Close", () => panel.remove());
        panel.append(select, evidence, draft, open, copy, close);
      })
      .catch((error) => {
        status.textContent = `${error.message} Connect the extension with a current Rating Guard user session.`;
      });
  }

  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      event.data?.source !== "rating-guard-app" ||
      event.data?.type !== "open-assistant" ||
      event.data?.scanId !== match[1] ||
      typeof event.data?.token !== "string"
    )
      return;
    chrome.runtime
      .sendMessage({ type: "connect", scanId: match[1], token: event.data.token })
      .then((result) => {
        if (result.error) throw new Error(result.error);
        openAssistant();
      })
      .catch((error) =>
        notify("assistant-error", { message: error.message || "Could not authorize extension." }),
      );
  });
})();
