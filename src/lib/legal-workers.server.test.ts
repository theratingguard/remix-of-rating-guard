import { describe, expect, it } from "vitest";
import { COUNTRY_LEGAL_INFO, LEGAL_COUNTRIES } from "./legal-laws/country-laws";
import { generateLegalRequest } from "./legal-orchestrator.server";
import { LEGAL_WORKERS, getLegalWorker } from "./legal-workers.server";
import { regionForAddress, regionForCountryCode } from "./regional-routing";

describe("country legal workers", () => {
  it("registers the requested 20 countries with official-source law references", () => {
    expect(LEGAL_COUNTRIES).toHaveLength(20);
    expect(LEGAL_WORKERS.size).toBe(20);
    for (const country of LEGAL_COUNTRIES) {
      const info = COUNTRY_LEGAL_INFO[country];
      expect(getLegalWorker(country)?.country).toBe(country);
      expect(info.laws.length).toBeGreaterThan(0);
      expect(info.publicLawPortal).toMatch(/^https:\/\//);
      for (const law of info.laws) {
        expect(law.sourceUrl).toMatch(/^https:\/\//);
        expect(law.scope).toContain("not");
      }
    }
  });

  it("provides local primary, follow-up and escalation templates without submitting", () => {
    const worker = getLegalWorker("IN");
    expect(worker).toBeDefined();
    const input = {
      businessName: "Example Cafe",
      reviewUrl: "https://maps.google.com/review/fixture",
      reviewerName: "Review author",
      reviewText: "The quoted concern.",
      policy: "Spam",
      evidenceQuote: "The quoted concern",
    };
    const primary = worker!.generateRequest(input);
    expect(primary.text).toContain("Example Cafe");
    expect(primary.text).toContain("The quoted concern");
    expect(primary.text).toContain("Please independently review");
    expect(primary.method).toBe("google-policy-review");
    expect(primary.laws[0]?.name).toBe("Consumer Protection Act 2019");
    expect(worker!.generateRequest(input, "followUp").text).toContain("following up");
    expect(worker!.generateRequest(input, "escalation").text).toContain("appeal");
    expect(worker!.submitMethod().automated).toBe(false);
    expect(worker!.followUpSchedule().map((step) => step.afterDays)).toEqual([7, 14]);
  });

  it("generates all three local request templates for every registered country", () => {
    const input = {
      businessName: "Example Cafe",
      reviewUrl: "https://maps.google.com/review/fixture",
      reviewerName: "Review author",
      reviewText: "The quoted concern.",
      policy: "Spam",
      evidenceQuote: "The quoted concern",
    };
    for (const country of LEGAL_COUNTRIES) {
      const worker = getLegalWorker(country);
      expect(worker).toBeDefined();
      for (const template of ["primary", "followUp", "escalation"] as const) {
        const request = worker!.generateRequest(input, template);
        expect(request.country).toBe(country);
        expect(request.template).toBe(template);
        expect(request.text).toContain("Example Cafe");
        expect(request.text).toContain("The quoted concern");
        expect(request.laws.length).toBeGreaterThan(0);
        expect(request.method).toBe("google-policy-review");
      }
      expect(worker!.submitMethod().automated).toBe(false);
    }
  });

  it("detects a specific country from scan region or an exact formatted-address suffix", async () => {
    expect(regionForCountryCode("FR")).toBe("FR");
    expect(regionForAddress("5 Example Road, Paris, France")).toBe("FR");
    const request = await generateLegalRequest(
      { region: null, address: "5 Example Road, Paris, France", business_name: "Cafe" },
      {
        author: "Reviewer",
        review_uri: null,
        text: "A review quote",
        analysis: { category: "Spam", evidence: "A review" },
      },
    );
    expect(request.country).toBe("FR");
    expect(request.laws[0]?.name).toBe("Code de la consommation");
    expect(request.text).toContain("Cafe");
  });

  it("falls back safely for regions outside the 20 country-specific workers", async () => {
    const request = await generateLegalRequest(
      { region: "EU", address: null, business_name: "Business" },
      { author: "Reviewer", review_uri: null, text: null, analysis: null },
    );
    expect(request.country).toBeNull();
    expect(request.laws).toEqual([]);
    expect(request.legalNote).toContain("not legal advice");
    expect(request.text).toContain("Google Maps user-generated-content policies");
  });
});
