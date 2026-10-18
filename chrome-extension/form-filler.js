(() => {
  if (!/^https:\/\/(?:www|maps)\.google\.com\/maps\/reviews\//.test(location.href)) return;

  chrome.runtime
    .sendMessage({ type: "prepared" })
    .then((prepared) => {
      if (!prepared || prepared.error) return;
      const panel = document.createElement("section");
      panel.setAttribute("aria-label", "Rating Guard review verification");
      Object.assign(panel.style, {
        position: "fixed",
        zIndex: "2147483647",
        inset: "12px 12px auto auto",
        width: "min(440px, calc(100vw - 24px))",
        maxHeight: "70vh",
        overflow: "auto",
        padding: "16px",
        border: "2px solid #0f766e",
        borderRadius: "12px",
        background: "#fff",
        color: "#111827",
        boxShadow: "0 8px 32px #0005",
        font: "14px/1.5 system-ui,sans-serif",
      });
      const heading = document.createElement("h2");
      heading.textContent = "Rating Guard · review verification";
      const context = document.createElement("p");
      context.textContent = `${prepared.business} · ${prepared.policy}`;
      const status = document.createElement("p");
      status.setAttribute("role", "status");
      status.textContent = "Waiting for the exact review to load in Google Maps…";
      panel.append(heading, context, status);
      document.body.append(panel);

      const showVerifiedDraft = () => {
        const pageText = document.body.innerText ?? document.body.textContent ?? "";
        if (!pageText.includes(prepared.business) || !pageText.includes(prepared.evidence))
          return false;

        observer.disconnect();
        document.defaultView?.clearTimeout(timeout);
        panel.setAttribute("aria-label", "Rating Guard verified report draft");
        heading.textContent = "Rating Guard · exact review verified";
        status.textContent = "";

        const quote = document.createElement("blockquote");
        quote.textContent = `Source quote: “${prepared.evidence}”`;
        const explanation = document.createElement("p");
        explanation.textContent =
          "Use the review’s menu (⋮) → Report review. Choose the matching reason in Google. Rating Guard does not fill Google's controls or submit.";
        const draft = document.createElement("textarea");
        draft.readOnly = true;
        draft.rows = 7;
        draft.value = prepared.request;
        draft.style.width = "100%";
        draft.setAttribute("aria-label", "Verified request draft");
        const copy = document.createElement("button");
        copy.type = "button";
        copy.textContent = "Copy request draft";
        copy.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(prepared.request);
            status.textContent =
              "Copied. Verify all facts before submitting via Google's Report review flow.";
          } catch {
            status.textContent = "Clipboard unavailable. Select and copy the draft manually.";
          }
        });
        const close = document.createElement("button");
        close.type = "button";
        close.textContent = "Close";
        close.addEventListener("click", () => {
          observer.disconnect();
          document.defaultView?.clearTimeout(timeout);
          panel.remove();
        });
        panel.append(quote, explanation, draft, copy, close);
        return true;
      };

      const observer = new MutationObserver(showVerifiedDraft);
      const timeout = document.defaultView?.setTimeout(() => {
        observer.disconnect();
        if (panel.isConnected) {
          status.textContent =
            "The exact business and review text could not be verified. No draft is available.";
        }
      }, 30_000);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      showVerifiedDraft();
    })
    .catch((error) => console.error("[Rating Guard] Review verification failed:", error.message));
})();
