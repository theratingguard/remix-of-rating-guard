importScripts("session-token.js");

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type === "prepared") {
    (async () => {
      const { prepared } = await chrome.storage.session.get("prepared");
      const url = new URL(sender.url);
      if (
        sender.id !== chrome.runtime.id ||
        !prepared ||
        prepared.tabId !== sender.tab?.id ||
        prepared.expires < Date.now() ||
        url.origin !== "https://support.google.com" ||
        !url.pathname.startsWith("/business/")
      )
        throw new Error("No authorized, tab-bound preparation available.");
      return prepared;
    })()
      .then(respond)
      .catch((error) => respond({ error: error.message }));
    return true;
  }
  const allowed =
    sender.id === chrome.runtime.id &&
    (!sender.url || sender.url.startsWith(chrome.runtime.getURL("")));
  if (!allowed) {
    respond({ error: "Popup-only privileged operation." });
    return false;
  }
  (async () => {
    if (message.type === "connect") {
      const token = globalThis.ratingGuardSessionToken(message.token);
      await chrome.storage.session.clear();
      await chrome.storage.session.set({ token });
      return { ok: true };
    }
    if (message.type === "disconnect") {
      await chrome.storage.session.clear();
      return { ok: true };
    }
    const session = await chrome.storage.session.get("token");
    let token;
    try {
      token = globalThis.ratingGuardSessionToken(session.token);
    } catch (error) {
      await chrome.storage.session.clear();
      throw error;
    }
    if (typeof message.scanId !== "string" || !/^[0-9a-f-]{36}$/.test(message.scanId))
      throw new Error("Invalid report ID.");
    const response = await fetch(
      `https://ratingguard.online/api/extension/report?scanId=${encodeURIComponent(message.scanId)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    const report = await response.json();
    if (!response.ok) throw new Error(report.error || `Report access failed (${response.status}).`);
    if (message.type === "report") return report;
    if (!["prepare", "manage"].includes(message.type)) throw new Error("Unsupported operation.");
    const review = report.reviews.find((row) => row.reviewId === message.reviewId);
    if (!review) throw new Error("Selected review has no validated removal draft.");
    const tab = await chrome.tabs.create({ url: "about:blank" });
    await chrome.storage.session.set({
      prepared: {
        tabId: tab.id,
        expires: Date.now() + 15 * 60000,
        scanId: report.scanId,
        business: report.business,
        ...review,
      },
    });
    await chrome.tabs.update(tab.id, {
      url:
        message.type === "manage"
          ? "https://support.google.com/business/workflow/9945796?hl=en"
          : review.reviewUrl,
    });
    return { ok: true };
  })()
    .then(respond)
    .catch((error) => respond({ error: error.message }));
  return true;
});
