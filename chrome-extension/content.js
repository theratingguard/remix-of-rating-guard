if (location.origin === "https://ratingguard.online") {
  const button = document.createElement("button");
  button.textContent = "Submit to Google - open Rating Guard extension";
  button.type = "button";
  button.addEventListener("click", () => {
    button.textContent =
      "Use the Rating Guard toolbar extension: connect, load report, select a supported review.";
  });
  document.querySelector("main")?.prepend(button);
} else {
  // No account access or form submission is automated. Form fields are only filled
  // after explicit preparation, on the same tab, with exact recognized labels.
  chrome.runtime
    .sendMessage({ type: "prepared" })
    .then((prepared) => {
      if (prepared.error) return;
      const panel = document.createElement("section");
      panel.setAttribute("aria-label", "Rating Guard preparation");
      const text = document.createElement("p");
      text.textContent = `${prepared.business}: ${prepared.policy}. Verify the selected review before filling.`;
      const draft = document.createElement("textarea");
      draft.readOnly = true;
      draft.value = `${prepared.reviewUrl}\n${prepared.request}`;
      draft.setAttribute("aria-label", "Prepared evidence (not submitted)");
      const fill = document.createElement("button");
      fill.type = "button";
      fill.textContent = "Fill recognized fields after checking review identity";
      fill.addEventListener("click", () => {
        try {
          if (prepared.expires < Date.now())
            throw new Error("Preparation expired; reload the authorized report.");
          const result = globalThis.ratingGuardFillForm(document, prepared);
          text.textContent = `Filled ${result} recognized fields. Inspect all values and click Google Submit manually. No submission has been recorded.`;
        } catch (error) {
          text.textContent = `Not filled: ${error.message}`;
        }
      });
      panel.append(text, draft, fill);
      document.body.prepend(panel);
    })
    .catch((error) => console.error("[Rating Guard] Auto-fill unavailable:", error.message));
}
