import { describe, expect, it } from "vitest";
import { countries, industries, programmaticSeoPaths } from "./lead-catalog.js";
import { getIndustryCountryPage, getCountry } from "./industry-seo";

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
});
