import { describe, expect, it } from "vitest";
import { createDirectAnswer } from "./direct-answer";

describe("createDirectAnswer", () => {
  it.each([
    ["Can Rating Guard remove reviews?", "Rating Guard provides review evidence tools."],
    [
      "How to assess Google review policy for a local business",
      "The service organizes review details and evidence.",
    ],
    ["Review analysis", ""],
  ])("returns a concise, policy-accurate answer for %s", (query, source) => {
    const answer = createDirectAnswer(query, source);
    const wordCount = answer.trim().split(/\s+/).length;
    expect(wordCount).toBeGreaterThanOrEqual(40);
    expect(wordCount).toBeLessThanOrEqual(50);
    expect(answer).toContain("Google independently decides");
    expect(answer).toContain("removal is not guaranteed");
  });
});
