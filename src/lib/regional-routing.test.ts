import { describe, expect, it } from "vitest";
import {
  getRegionalStrategy,
  isRegion,
  regionForCountryCode,
  regionFromPlace,
} from "./regional-routing";
import { detectBusinessRegion } from "./region-detect.server";

describe("regional routing", () => {
  it.each([
    ["GB", "UK"],
    ["DE", "DE"],
    ["FR", "FR"],
    ["IT", "IT"],
    ["ES", "ES"],
    ["NL", "NL"],
    ["IN", "IN"],
    ["US", "US"],
    ["CA", "CA"],
    ["AU", "AU"],
    ["AE", "AE"],
    ["SG", "SG"],
    ["PH", "PH"],
    ["KE", "KE"],
    ["RW", "RW"],
    ["ZA", "ZA"],
    ["NG", "NG"],
    ["GH", "AF"],
    ["JP", "JP"],
    ["BR", "BR"],
    ["MX", "MX"],
    [null, "OTHER"],
  ] as const)("maps country %s to strategy region %s", (country, expected) => {
    expect(regionForCountryCode(country)).toBe(expected);
  });

  it("uses detected country before manual fallback", () => {
    expect(regionFromPlace("GB", "IN")).toBe("UK");
    expect(regionFromPlace(null, "IN")).toBe("IN");
    expect(regionFromPlace("GB", null)).toBe("UK");
    expect(regionFromPlace(null, null)).toBe("OTHER");
  });

  it("records whether Google, its formatted address, or manual fallback supplied the country", () => {
    expect(
      detectBusinessRegion({
        countryCode: "GB",
        formattedAddress: "Paris, France",
        manualSelection: "IN",
      }),
    ).toEqual({ region: "UK", source: "google_places" });
    expect(detectBusinessRegion({ formattedAddress: "Paris, France" })).toEqual({
      region: "FR",
      source: "address",
    });
    expect(detectBusinessRegion({ manualSelection: "IN" })).toEqual({
      region: "IN",
      source: "manual",
    });
  });

  it("recognizes only configured region identifiers", () => {
    expect(isRegion("PH")).toBe(true);
    expect(isRegion("XX")).toBe(false);
    expect(isRegion(null)).toBe(false);
  });

  it("routes every jurisdiction through the published Google policy and avoids unsupported legal claims", () => {
    const strategy = getRegionalStrategy("DE");
    expect(strategy.worker).toBe("de-policy-strategy");
    expect(strategy.removalMethod).toBe("google-policy-review");
    expect(strategy.policyUrl).toBe("https://support.google.com/contributionpolicy/answer/7400114");
    expect(strategy.legalGuidance).toContain("qualified local counsel");
    expect(strategy.legalGuidance).not.toContain("guarantee");
  });
});
