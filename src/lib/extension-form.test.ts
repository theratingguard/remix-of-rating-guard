import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";

const filler = readFileSync(join(process.cwd(), "chrome-extension", "form-filler.js"), "utf8");
const prepared = {
  business: "Example Cafe",
  evidence: "Buy my product at spam.example",
  reviewUrl: "https://www.google.com/maps/reviews/data=review-id",
  policy: "Spam",
  request: "This review advertises: Buy my product at spam.example",
  expires: Date.now() + 60_000,
};

describe("Google Maps extension helper", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  async function runFor(url: string, body: string) {
    const dom = new JSDOM(`<body>${body}</body>`, { url });
    const sendMessage = vi.fn().mockResolvedValue(prepared);
    new Function("chrome", "location", "document", filler)(
      { runtime: { sendMessage } },
      dom.window.location,
      dom.window.document,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { dom, sendMessage };
  }

  it("only shows a copy-only helper for the exact Google Maps review", async () => {
    const { dom, sendMessage } = await runFor(
      "https://www.google.com/maps/reviews/data=review-id",
      `<main>Example Cafe Buy my product at spam.example</main><button id="submit">Submit</button>`,
    );
    expect(sendMessage).toHaveBeenCalledWith({ type: "prepared" });
    expect(
      dom.window.document.querySelector<HTMLTextAreaElement>(
        '[aria-label="Verified request draft"]',
      )?.value,
    ).toBe(prepared.request);
    expect(dom.window.document.getElementById("submit")?.textContent).toBe("Submit");
  });

  it("supports the maps.google.com review host", async () => {
    const { dom, sendMessage } = await runFor(
      "https://maps.google.com/maps/reviews/data=review-id",
      `<main>Example Cafe Buy my product at spam.example</main>`,
    );
    expect(sendMessage).toHaveBeenCalledWith({ type: "prepared" });
    expect(
      dom.window.document.querySelector('[aria-label="Verified request draft"]'),
    ).not.toBeNull();
  });

  it("does not run on unrelated Google Maps pages", async () => {
    const { sendMessage } = await runFor(
      "https://www.google.com/maps/place/cafe",
      "<main>Cafe</main>",
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("does not reveal a draft if the exact source evidence is absent", async () => {
    const { dom } = await runFor(
      "https://www.google.com/maps/reviews/data=review-id",
      "<main>Example Cafe unrelated text</main>",
    );
    expect(dom.window.document.querySelector('[role="status"]')?.textContent).toContain(
      "Waiting for the exact review to load",
    );
    expect(dom.window.document.querySelector('[aria-label="Verified request draft"]')).toBeNull();
  });

  it("reveals the draft when Google Maps renders the exact review after the script runs", async () => {
    const { dom } = await runFor(
      "https://www.google.com/maps/reviews/data=review-id",
      "<main>Example Cafe review loading</main>",
    );
    expect(dom.window.document.querySelector('[aria-label="Verified request draft"]')).toBeNull();

    dom.window.document.querySelector("main")!.textContent = `Example Cafe ${prepared.evidence}`;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      dom.window.document.querySelector<HTMLTextAreaElement>(
        '[aria-label="Verified request draft"]',
      )?.value,
    ).toBe(prepared.request);
    expect(
      dom.window.document.querySelector('[aria-label="Rating Guard verified report draft"]'),
    ).not.toBeNull();
  });

  it("does not run on a non-Google page", async () => {
    const { sendMessage } = await runFor("https://example.com/", "<main>Review</main>");
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
