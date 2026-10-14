importScripts("session-token.js");

const API = "https://ratingguard.online/api/extension";

function extensionPage(sender) {
  return sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(""));
}

function scanReportPage(sender, scanId) {
  if (sender.id !== chrome.runtime.id || !sender.url || !sender.tab?.id) return false;
  try {
    const url = new URL(sender.url);
    return (
      url.origin === "https://ratingguard.online" &&
      (url.pathname === `/scan-report/${scanId}` || url.pathname === `/scan-report/${scanId}/`)
    );
  } catch {
    return false;
  }
}

async function authenticatedFetch(path, token, init = {}) {
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const endpoint = path.startsWith("/") ? `https://ratingguard.online${path}` : `${API}/${path}`;
  const response = await fetch(endpoint, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || `Rating Guard request failed (${response.status}).`);
  return result;
}

async function sessionToken() {
  const session = await chrome.storage.session.get("token");
  try {
    return globalThis.ratingGuardSessionToken(session.token);
  } catch (error) {
    await chrome.storage.session.remove(["token", "prepared"]);
    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type === "prepared") {
    (async () => {
      const { prepared } = await chrome.storage.session.get("prepared");
      if (
        sender.id !== chrome.runtime.id ||
        !prepared ||
        prepared.tabId !== sender.tab?.id ||
        prepared.expires < Date.now() ||
        !/^https:\/\/(www|maps)\.google\.com\/maps\/reviews\//.test(sender.url ?? "") ||
        !/^https:\/\/(www|maps)\.google\.com\/maps\/reviews\//.test(prepared.reviewUrl)
      )
        throw new Error("No active, exact-review preparation is available in this tab.");
      return prepared;
    })()
      .then(respond)
      .catch((error) => respond({ error: error.message }));
    return true;
  }

  (async () => {
    if (message.type === "connect") {
      if (
        !extensionPage(sender) &&
        (typeof message.scanId !== "string" ||
          !/^[0-9a-f-]{36}$/i.test(message.scanId) ||
          !scanReportPage(sender, message.scanId))
      )
        throw new Error("Connect from the Rating Guard report page or extension popup.");
      const token = globalThis.ratingGuardSessionToken(message.token);
      const status = await authenticatedFetch("status", token);
      await chrome.storage.session.remove(["token", "prepared"]);
      await chrome.storage.session.set({
        token,
        ...(message.scanId ? { activeReportId: message.scanId } : {}),
      });
      return { ok: true, email: status.email };
    }
    if (message.type === "disconnect") {
      if (!extensionPage(sender)) throw new Error("Disconnect from the extension popup only.");
      await chrome.storage.session.clear();
      return { ok: true };
    }

    if (message.type === "report") {
      if (!extensionPage(sender) && !scanReportPage(sender, message.scanId))
        throw new Error("Open a Rating Guard scan report to load its supported drafts.");
      if (typeof message.scanId !== "string" || !/^[0-9a-f-]{36}$/i.test(message.scanId))
        throw new Error("Invalid report ID.");
      const token = await sessionToken();
      const report = await authenticatedFetch(
        `report/${encodeURIComponent(message.scanId)}`,
        token,
      );
      await chrome.storage.session.set({ activeReportId: report.scanId });
      return report;
    }

    if (message.type === "uploadPdf") {
      if (!extensionPage(sender)) throw new Error("Upload PDFs from the extension popup only.");
      if (
        typeof message.filename !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,190}\.pdf$/i.test(message.filename) ||
        typeof message.base64 !== "string" ||
        message.base64.length > 33_554_432
      )
        throw new Error("Choose a PDF file smaller than 24 MB.");
      const binary = atob(message.base64);
      if (!binary.startsWith("%PDF-")) throw new Error("The selected file is not a valid PDF.");
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const form = new FormData();
      form.append("folder", "reports");
      form.append("file", new File([bytes], message.filename, { type: "application/pdf" }));
      const token = await sessionToken();
      return await authenticatedFetch("/api/storage/upload", token, {
        method: "POST",
        body: form,
      });
    }

    if (message.type === "prepare") {
      if (!extensionPage(sender) && !scanReportPage(sender, message.scanId))
        throw new Error("Prepare a report from Rating Guard or the extension popup.");
      const token = await sessionToken();
      const report = await authenticatedFetch(
        `report/${encodeURIComponent(message.scanId)}`,
        token,
      );
      const review = report.reviews.find((row) => row.reviewId === message.reviewId);
      if (!review) throw new Error("Selected review has no source-validated policy draft.");
      const tab = await chrome.tabs.create({ url: "about:blank" });
      if (!tab.id) throw new Error("Could not open the exact Google Maps review.");
      await chrome.storage.session.set({
        activeReportId: report.scanId,
        prepared: {
          tabId: tab.id,
          expires: Date.now() + 15 * 60000,
          scanId: report.scanId,
          business: report.business,
          ...review,
        },
      });
      await chrome.tabs.update(tab.id, { url: review.reviewUrl });
      return { ok: true };
    }

    if (message.type === "record") {
      if (!extensionPage(sender))
        throw new Error("Record submissions from the extension popup only.");
      if (
        message.confirmed !== true ||
        typeof message.verificationReference !== "string" ||
        message.verificationReference.trim().length < 10 ||
        typeof message.submittedAt !== "string"
      )
        throw new Error("Confirm the actual Google submission and provide its reference.");
      const token = await sessionToken();
      const { activeReportId } = await chrome.storage.session.get("activeReportId");
      if (typeof activeReportId !== "string") throw new Error("Load a report before recording.");
      const report = await authenticatedFetch(
        `report/${encodeURIComponent(activeReportId)}`,
        token,
      );
      const review = report.reviews.find((row) => row.reviewId === message.reviewId);
      if (!review) throw new Error("Selected review has no source-validated policy draft.");
      const result = await authenticatedFetch("submission", token, {
        method: "POST",
        body: JSON.stringify({
          scanId: report.scanId,
          reviewId: review.reviewId,
          submittedAt: message.submittedAt,
          verificationReference: message.verificationReference.trim(),
          requestText: review.request,
          confirmed: true,
        }),
      });
      return { ok: true, ...result };
    }

    throw new Error("Unsupported extension action.");
  })()
    .then(respond)
    .catch((error) => respond({ error: error instanceof Error ? error.message : String(error) }));
  return true;
});
