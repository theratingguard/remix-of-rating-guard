import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const contentScript = readFileSync(join(process.cwd(), "chrome-extension", "content.js"), "utf8");
const scanId = "31b8e932-77cd-4115-bd93-b91ca19eba7b";
const review = {
  reviewId: "41b8e932-77cd-4115-bd93-b91ca19eba7b",
  reviewUrl: "https://www.google.com/maps/reviews/data=review-id",
  policy: "Fake Engagement",
  evidence: "Other reviews were paid",
  request: "Please assess this exact review.",
};
let dom: JSDOM | undefined;

function install(options: { session?: string; sendMessage?: ReturnType<typeof vi.fn> } = {}) {
  dom = new JSDOM("<body><main><main><h1>Scan report</h1></main></main></body>", {
    url: `https://ratingguard.online/scan-report/${scanId}`,
  });
  if (options.session) dom.window.localStorage.setItem("sb-project-auth-token", options.session);
  const sendMessage =
    options.sendMessage ??
    vi
      .fn()
      .mockResolvedValueOnce({ ok: true, email: "admin@example.com" })
      .mockResolvedValueOnce({ scanId, business: "Example Cafe", reviews: [review] });
  new Function("chrome", "location", "localStorage", "document", "window", contentScript)(
    { runtime: { sendMessage } },
    dom.window.location,
    dom.window.localStorage,
    dom.window.document,
    dom.window,
  );
  return { dom, sendMessage };
}

function launchAssistant(dom: JSDOM) {
  dom.window.dispatchEvent(
    new dom.window.MessageEvent("message", {
      source: dom.window,
      origin: dom.window.location.origin,
      data: {
        source: "rating-guard-app",
        type: "open-assistant",
        scanId,
      },
    }),
  );
}

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Rating Guard report page extension", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    dom?.window.close();
    dom = undefined;
  });

  it("opens from the page signal and sends the session only via extension messaging", async () => {
    const { dom, sendMessage } = install({
      session: JSON.stringify({ access_token: "user-session-jwt" }),
    });
    launchAssistant(dom);
    await tick();
    expect(sendMessage).toHaveBeenNthCalledWith(1, {
      type: "connect",
      scanId,
      token: "user-session-jwt",
    });
    expect(dom.window.document.querySelector("#rating-guard-extension-panel")).not.toBeNull();
    expect(dom.window.document.body.textContent).not.toContain("user-session-jwt");
    expect(dom.window.document.body.querySelectorAll("script")).toHaveLength(0);
  });

  it("reports missing session without requesting private report data", async () => {
    const sendMessage = vi.fn();
    const { dom } = install({ sendMessage });
    launchAssistant(dom);
    await tick();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(dom.window.document.body.textContent).toContain("No signed-in Rating Guard session");
  });

  it("only renders the selected verified draft after API access succeeds", async () => {
    const { dom, sendMessage } = install({
      session: JSON.stringify({ access_token: "user-session-jwt" }),
    });
    launchAssistant(dom);
    await tick();
    const panel = dom.window.document.querySelector("#rating-guard-extension-panel");
    expect(panel?.textContent).toContain("Example Cafe");
    expect(panel?.textContent).toContain(review.evidence);
    panel?.querySelector("button")?.click();
    await tick();
    expect(sendMessage).toHaveBeenCalledWith({
      type: "prepare",
      scanId,
      reviewId: review.reviewId,
    });
  });
});
