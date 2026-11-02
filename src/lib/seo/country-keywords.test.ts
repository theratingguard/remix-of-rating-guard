import { describe, expect, it } from "vitest";
import { generateCountrySeoKeywords } from "./country-keywords";
import { SEO_LOCALES } from "./locales";

describe("country SEO keyword generation", () => {
  it("generates a concise set of distinct country keywords for all 20 country locales", () => {
    expect(SEO_LOCALES).toHaveLength(20);

    for (const locale of SEO_LOCALES) {
      const keywords = generateCountrySeoKeywords(locale.code);
      expect(keywords).toHaveLength(10);
      expect(new Set(keywords).size).toBe(10);
      expect(
        keywords.every((keyword) =>
          keyword.includes(
            locale.country === "United States"
              ? "USA"
              : locale.country === "United Kingdom"
                ? "UK"
                : locale.country,
          ),
        ),
      ).toBe(true);
    }

    expect(generateCountrySeoKeywords("en-US")).toContain(
      "Google review removal policy help in USA",
    );
    expect(generateCountrySeoKeywords("en-GB")).toContain("fake review removal service in UK");
  });

  it("does not produce country keywords for unsupported locales", () => {
    expect(generateCountrySeoKeywords("xx-XX")).toEqual([]);
  });
});
