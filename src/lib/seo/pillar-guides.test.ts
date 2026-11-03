import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getPillarGuide, PILLAR_GUIDES, relatedPillarGuides } from "./pillar-guides";

describe("editorial pillar guides", () => {
  it("provides five substantial, independently addressable guides", () => {
    expect(PILLAR_GUIDES).toHaveLength(5);
    expect(new Set(PILLAR_GUIDES.map((guide) => guide.slug)).size).toBe(5);

    for (const guide of PILLAR_GUIDES) {
      expect(guide.sections.length).toBeGreaterThanOrEqual(4);
      expect(guide.faqs.length).toBeGreaterThanOrEqual(3);
      expect(
        [guide.intro, ...guide.sections.map((section) => section.body)].join(" ").split(/\s+/)
          .length,
      ).toBeGreaterThan(300);
      expect(guide.description.length).toBeLessThanOrEqual(160);
      expect(getPillarGuide(guide.slug)).toEqual(guide);
    }

    expect(getPillarGuide("not-a-guide")).toBeUndefined();
  });

  it("selects only contextually related guides for internal links", () => {
    const links = relatedPillarGuides(
      "How to assess Google review policy and organize review evidence for customer feedback.",
    );
    expect(links.map((guide) => guide.slug)).toContain("google-review-policy-assessment");
    expect(links.map((guide) => guide.slug)).toContain("review-evidence-and-recordkeeping");
    expect(relatedPillarGuides("A subject with no matching editorial topic")).toEqual([]);
    expect(relatedPillarGuides("review evidence management", 1)).toHaveLength(1);
  });

  it("registers every guide in the sitemap and generated route tree", () => {
    const sitemapSource = readFileSync("scripts/generate-sitemap.mjs", "utf8");
    const routeTree = readFileSync("src/routeTree.gen.ts", "utf8");
    expect(sitemapSource).toContain('"/guides"');
    expect(routeTree).toContain("/guides/$slug");
    expect(routeTree).toContain("declare module '@tanstack/react-start'");
    for (const guide of PILLAR_GUIDES) {
      expect(sitemapSource).toContain(`/guides/${guide.slug}`);
    }
  });
});
