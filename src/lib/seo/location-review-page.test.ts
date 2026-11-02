import { describe, expect, it } from "vitest";
import { isLocationContent } from "./location-review-page";

function locationContent(wordsPerPart: number) {
  const prose = Array.from({ length: wordsPerPart }, (_, index) => `word${index}`).join(" ");
  return {
    intro: prose,
    sections: [
      { heading: "Review policy", body: prose },
      { heading: "Evidence", body: prose },
      { heading: "Next steps", body: prose },
    ],
    faqs: [{ question: "What happens next?", answer: prose }],
  };
}

describe("location review page content", () => {
  it("accepts useful pages with at least 300 prose words", () => {
    expect(isLocationContent(locationContent(75))).toBe(true);
  });

  it("rejects pages with less than 300 prose words", () => {
    expect(isLocationContent(locationContent(40))).toBe(false);
  });
});
