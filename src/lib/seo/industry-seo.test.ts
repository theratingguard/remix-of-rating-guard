import { describe, expect, it } from "vitest";
import {
  countries,
  industries,
  programmaticSeoAlternates,
  programmaticSeoPaths,
} from "./lead-catalog.js";
import {
  agencyHead,
  getIndustryCountryPage,
  getCountry,
  industryReviewHead,
  partnerHead,
} from "./industry-seo";

describe("programmatic industry SEO catalog", () => {
  it("contains the seeded 30 industries and 119 countries", () => {
    expect(industries).toHaveLength(30);
    expect(countries).toHaveLength(119);
    expect(new Set(industries.map(({ slug }) => slug)).size).toBe(industries.length);
    expect(new Set(countries.map(({ code }) => code)).size).toBe(countries.length);
  });

  it("builds all three route families without duplicate URLs", () => {
    const paths = programmaticSeoPaths();

    expect(paths.review).toHaveLength(3570);
    expect(paths.agency).toHaveLength(3570);
    expect(paths.partners).toHaveLength(119);
    expect(new Set([...paths.review, ...paths.agency, ...paths.partners]).size).toBe(7259);
    expect(paths.review).toContain("/remove-google-review/restaurants/united-states");
    expect(paths.agency).toContain("/start-restaurants-agency/united-states");
    expect(paths.partners).toContain("/partners/united-states");
  });

  it("resolves only known industry and country slugs", () => {
    expect(getIndustryCountryPage("restaurants", "united-states")?.country.currency).toBe("USD");
    expect(getIndustryCountryPage("unknown", "united-states")).toBeNull();
    expect(getCountry("not-a-country")).toBeUndefined();
  });

  it("resolves country-code URLs for review, agency, and partner pages", () => {
    expect(getCountry("us")?.slug).toBe("united-states");
    expect(getIndustryCountryPage("restaurants", "us")?.country.name).toBe("United States");
  });

  it("adds self-canonical and reciprocal regional hreflang links to programmatic pages", () => {
    const data = getIndustryCountryPage("restaurants", "us");
    if (!data) throw new Error("Expected seeded restaurant and US catalog entries.");

    const heads = [
      industryReviewHead(data),
      agencyHead(data),
      partnerHead({ country: data.country }),
    ];
    const expected = [
      {
        rel: "canonical",
        href: "https://ratingguard.online/remove-google-review/restaurants/united-states",
      },
      {
        rel: "canonical",
        href: "https://ratingguard.online/start-restaurants-agency/united-states",
      },
      {
        rel: "canonical",
        href: "https://ratingguard.online/partners/united-states",
      },
    ];

    heads.forEach((head, index) => {
      expect(head.links).toContainEqual(expected[index]);
      expect(head.links?.filter((link) => link.rel === "alternate")).toHaveLength(
        countries.length + 1,
      );
      expect(head.links).toContainEqual({
        rel: "alternate",
        hrefLang: "en-US",
        href: expected[index]!.href,
      });
      expect(head.links).toContainEqual({
        rel: "alternate",
        hrefLang: "x-default",
        href: expected[index]!.href,
      });
      const schemas = (head.scripts ?? []).map((script) => JSON.parse(script.children as string));
      expect(schemas.some((schema) => schema["@type"] === "AggregateRating")).toBe(false);
    });
  });

  it("builds regional alternate sets within each page family", () => {
    expect(programmaticSeoAlternates("review", "restaurants")).toHaveLength(countries.length + 1);
    expect(programmaticSeoAlternates("agency", "restaurants")[0]).toEqual({
      hrefLang: "en-US",
      path: "/start-restaurants-agency/united-states",
    });
    expect(programmaticSeoAlternates("partners").at(-1)).toEqual({
      hrefLang: "x-default",
      path: "/partners/united-states",
    });
    expect(() => programmaticSeoAlternates("review", "missing-industry")).toThrow(
      "Unknown industry",
    );
  });
});
