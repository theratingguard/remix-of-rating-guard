import { describe, expect, it } from "vitest";
import { generateCountryHashtags, HASHTAG_COUNTRIES } from "./generate-hashtags.js";

describe("country hashtag generation", () => {
  it("creates exactly 100 unique service hashtags for each of the 20 countries", () => {
    const hashtags = generateCountryHashtags();

    expect(HASHTAG_COUNTRIES).toHaveLength(20);
    expect(hashtags).toHaveLength(2_000);
    for (const { country_code } of HASHTAG_COUNTRIES) {
      const countryTags = hashtags.filter((tag) => tag.country_code === country_code);
      expect(countryTags).toHaveLength(100);
      expect(new Set(countryTags.map((tag) => tag.hashtag)).size).toBe(100);
    }
    expect(hashtags).toContainEqual({
      country_code: "US",
      hashtag: "#RemoveGoogleReviewUS",
    });
    expect(hashtags).toContainEqual({
      country_code: "US",
      hashtag: "#FakeReviewRemovalUSA",
    });
    expect(hashtags).toContainEqual({
      country_code: "US",
      hashtag: "#ReputationManagementUS",
    });
    expect(hashtags).toContainEqual({
      country_code: "US",
      hashtag: "#GoogleReviewFixUS",
    });
    expect(hashtags.every(({ hashtag }) => hashtag.length <= 32)).toBe(true);
  });
});
