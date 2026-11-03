import { describe, expect, it } from "vitest";
import { EDITORIAL_TEMPLATES } from "./editorial-templates";

describe("editorial sharing templates", () => {
  it("provides consent, transparency, and non-automation safeguards", () => {
    expect(EDITORIAL_TEMPLATES).toHaveLength(5);
    for (const template of EDITORIAL_TEMPLATES) {
      expect(template.disclosure.trim()).not.toBe("");
      expect(template.checklist.length).toBeGreaterThanOrEqual(3);
      expect(template.template).not.toMatch(/4\.9|500\+ reviews|guaranteed removals/i);
    }
    expect(
      EDITORIAL_TEMPLATES.find((template) => template.id === "case-study-interview")?.template,
    ).toContain("written permission");
  });
});
