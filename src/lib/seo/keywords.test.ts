import { afterEach, describe, expect, it, vi } from "vitest";
import {
  encryptSeoProviderKey,
  normalizeSeoKeywordRows,
  seoKeywordRecord,
} from "./keywords.server";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SEO keyword persistence helpers", () => {
  it("maps keyword research into pending programmatic SEO records", () => {
    const record = seoKeywordRecord({
      keyword: "review removal for hotels",
      country: "United Kingdom",
      search_volume: 1200,
      difficulty: 38,
      cpc: 4.25,
      intent: "commercial",
    });

    expect(record).toMatchObject({
      keyword: "review removal for hotels",
      country: "United Kingdom",
      locale: "en-GB",
      search_volume: 1200,
      difficulty: 38,
      cpc: 4.25,
      intent: "commercial",
      status: "pending",
      page_content: null,
    });
  });

  it("validates import batch sizes and values", () => {
    expect(
      normalizeSeoKeywordRows([{ keyword: "review risk assessment", country: "Canada" }]),
    ).toHaveLength(1);
    expect(() => normalizeSeoKeywordRows([])).toThrow("Import 1 to 500");
    expect(() => normalizeSeoKeywordRows([{ keyword: "x", country: "Canada" }])).toThrow();
  });

  it("encrypts provider credentials with an authenticated format", () => {
    vi.stubEnv("SEO_API_KEYS_ENCRYPTION_KEY", "a".repeat(64));
    const encrypted = encryptSeoProviderKey("semrush", "provider-key-value");

    expect(encrypted.provider).toBe("semrush");
    expect(encrypted.api_key).toMatch(/^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    expect(encrypted.api_key).not.toContain("provider-key-value");
  });
});
