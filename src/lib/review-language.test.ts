import { describe, expect, it } from "vitest";
import { detectReviewLanguage, languageEvidence } from "./review-language";

describe("review language helpers", () => {
  it.each([
    ["The food and service were good.", "english"],
    ["खाना बहुत अच्छा था", "hindi"],
    ["Food bahut acha tha, service bhi achi thi", "hinglish"],
    ["El servicio fue excelente", "regional"],
    ["123!!!", "unknown"],
  ] as const)("labels %s as %s", (text, language) => {
    expect(detectReviewLanguage(text).language).toBe(language);
  });

  it("extracts bounded Hindi and Hinglish policy vocabulary as evidence, not a verdict", () => {
    expect(languageEvidence("Paise dekar fake reviews likhe, yeh fraud hai")).toEqual({
      regionalSlangMarkers: [],
      defamationMarkers: ["fraud"],
      fakeEngagementMarkers: ["paise dekar", "fake reviews"],
    });
    expect(
      languageEvidence("Yeh service bahut bakwas aur ghatiya hai").regionalSlangMarkers,
    ).toEqual(["bakwas", "ghatiya"]);
    expect(languageEvidence("The service was slow")).toEqual({
      regionalSlangMarkers: [],
      defamationMarkers: [],
      fakeEngagementMarkers: [],
    });
  });
});
