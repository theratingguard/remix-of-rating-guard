import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const adapter = readFileSync(join(process.cwd(), "chrome-extension", "form-adapter.js"), "utf8");
const prepared = {
  business: "Example Cafe",
  evidence: "Buy my product at spam.example",
  reviewUrl: "https://www.google.com/maps/reviews/example",
  policy: "Spam",
  request: "This review advertises: Buy my product at spam.example",
};

describe("conservative extension form adapter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  function fill() {
    return new Function(`${adapter};return globalThis.ratingGuardFillForm(document,arguments[0]);`)(
      prepared,
    );
  }
  it("fills exact recognized labels and never clicks final Submit", () => {
    document.body.innerHTML = `<main><p>Example Cafe: Buy my product at spam.example</p>
      <input aria-label="Business name"><input aria-label="Review URL">
      <textarea aria-label="Evidence"></textarea><button id="submit">Submit</button></main>`;
    let submitted = false;
    document.getElementById("submit")!.onclick = () => {
      submitted = true;
    };
    expect(fill()).toBe(3);
    expect(document.querySelector("textarea")!.value).toBe(prepared.request);
    expect(submitted).toBe(false);
  });
  it("rejects unrelated business/review even with known labels", () => {
    document.body.innerHTML = `<main>Other cafe<textarea aria-label="Evidence"></textarea></main>`;
    expect(fill).toThrow("exact review evidence");
    expect(document.querySelector("textarea")!.value).toBe("");
  });
  it("does not guess reason-only controls or unsupported policy options", () => {
    document.body.innerHTML = `<main>Example Cafe: Buy my product at spam.example<input type="radio" aria-label="Policy type"></main>`;
    expect(fill).toThrow("Unsupported form");
    document.body.innerHTML = `<main>Example Cafe: Buy my product at spam.example<input aria-label="Business name">
      <select aria-label="Policy type"><option>Off topic</option></select></main>`;
    expect(fill).toThrow("Select the reason manually");
    expect(document.querySelector("input")!.value).toBe("");
  });
});
