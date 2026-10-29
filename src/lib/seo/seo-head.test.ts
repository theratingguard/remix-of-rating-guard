import { describe, expect, it } from "vitest";
import { SEOHead } from "./seo-head";

describe("SEOHead", () => {
  it("emits canonical metadata and Organization and WebSite schemas", () => {
    const head = SEOHead(
      {
        title: "About Rating Guard",
        description: "Learn about Rating Guard.",
      },
      [],
      { canonicalPath: "/about" },
    );
    const schemas = (head.scripts ?? []).map((script) => JSON.parse(script.children as string));

    expect(head.meta).toContainEqual({ title: "About Rating Guard" });
    expect(head.meta).toContainEqual({
      name: "description",
      content: "Learn about Rating Guard.",
    });
    expect(head.links).toContainEqual({
      rel: "canonical",
      href: "https://ratingguard.online/about",
    });
    expect(schemas).toContainEqual(
      expect.objectContaining({
        "@type": "Organization",
        name: expect.any(String),
      }),
    );
    expect(schemas).toContainEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: expect.any(String),
      url: "https://ratingguard.online",
    });
  });

  it("adds country hashtags to the page keywords metadata", () => {
    const tags = Array.from({ length: 100 }, (_, index) => `#ReviewRemoval${index}`);
    const head = SEOHead(
      {
        title: "Google review policy in the US",
        description: "Guidance for US businesses.",
        locale: "en-US",
        hashtags: tags,
      },
      [],
      { canonicalPath: "/remove-google-review/united-states/new-york" },
    );
    const keywordMeta = head.meta?.find((item) => "name" in item && item.name === "keywords");
    const keywords = keywordMeta && "content" in keywordMeta ? keywordMeta.content : "";

    expect(keywords).toContain("#ReviewRemoval0");
    expect(keywords).toContain("#ReviewRemoval99");
    expect(keywords).toContain("Google review removal policy help in USA");
    expect(keywords).toContain("fake review removal service in USA");
    expect(keywords.split(", ")).toHaveLength(204);
  });
});
