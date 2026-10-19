import { describe, expect, it } from "vitest";
import { buildOsmQuery, parsePageMetadata, parseSitemap } from "./seo-automation.server";

describe("SEO automation parsing", () => {
  it("extracts metadata and same-origin links, excluding external links", () => {
    const baseUrl = new URL("https://ratingguard.online/");
    const metadata = parsePageMetadata(
      '<title>Reviews &amp; reputation</title><meta name="description" content="Protect your brand"><a href="/contact">Contact</a><a href="https://other.example/">External</a>',
      baseUrl,
    );

    expect(metadata.title).toBe("Reviews &amp; reputation");
    expect(metadata.description).toBe("Protect your brand");
    expect(metadata.internalLinks).toEqual(["https://ratingguard.online/contact"]);
  });

  it("only returns valid same-origin page locations from the sitemap", () => {
    const origin = new URL("https://ratingguard.online/");
    const urls = parseSitemap(
      "<urlset><url><loc>https://ratingguard.online/</loc></url><url><loc>https://bad.example/phish</loc></url><url><loc>not-a-url</loc></url><url><loc>https://ratingguard.online/sitemap-child.xml</loc></url></urlset>",
      origin,
    );

    expect(urls).toEqual(["https://ratingguard.online/"]);
  });

  it("builds bounded Overpass queries from allowlisted categories", () => {
    const query = buildOsmQuery({
      latitude: 37.7749,
      longitude: -122.4194,
      radiusMeters: 3000,
      category: "dentists",
    });

    expect(query).toContain("[out:json][timeout:15]");
    expect(query).toContain("around:3000,37.7749,-122.4194");
    expect(query).toContain('[amenity~"dentist"]');
    expect(query).not.toContain("http");
  });
});
