import { describe, expect, it } from "vitest";
import { analyzeSemanticContent } from "./semantic-analyzer";

describe("analyzeSemanticContent", () => {
  it("extracts domain concepts and identifies missing reference topics", () => {
    const analysis = analyzeSemanticContent(
      "Google review policy reporting requires evidence and careful review.",
      "Google review policy",
      ["Moderation of misleading content can identify fake engagement and conflicts of interest."],
    );
    expect(analysis.extractedEntities).toContain("review policy");
    expect(analysis.missingTopics).toContain("moderation");
    expect(analysis.semanticScore).toBeGreaterThanOrEqual(0);
    expect(analysis.semanticScore).toBeLessThanOrEqual(100);
  });
});
