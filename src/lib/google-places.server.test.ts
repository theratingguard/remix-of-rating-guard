import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAndFetchPlace } from "./google-places.server";

const url = "https://www.google.com/maps/search/?api=1&query_place_id=test-place&query=test";
const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ ...dns, default: dns }));
describe("Google Places boundary (unit fixtures, not scan evidence)", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    "http://www.google.com/maps",
    "https://127.0.0.1/maps",
    "https://google.com.maps.app.attacker.com/maps",
  ])("rejects unsafe input before any request: %s", async (input) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(resolveAndFetchPlace("test-key", input)).rejects.toMatchObject({
      code: "INVALID_URL",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    "https://127.0.0.1/maps",
    "http://www.google.com/maps",
    "https://www.google.com.attacker.com/maps",
    "https://[::1]/maps",
  ])("rejects unsafe redirects: %s", async (location) => {
    dns.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 302, headers: { location } }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      resolveAndFetchPlace("test-key", "https://maps.app.goo.gl/test"),
    ).rejects.toMatchObject({ code: "RESOLVE_FAILED" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects a provider hostname resolving to private IP before fetch", async () => {
    dns.lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      resolveAndFetchPlace("test-key", "https://maps.app.goo.gl/test"),
    ).rejects.toMatchObject({ code: "RESOLVE_FAILED" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects unsupported CID-only links instead of guessing a business", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      resolveAndFetchPlace("test-key", "https://www.google.com/maps?cid=123"),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_LINK" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns an honest empty review list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          id: "test-place",
          displayName: { text: "Unit test fixture" },
        }),
      ),
    );
    const place = await resolveAndFetchPlace("test-key", url);
    expect(place.reviews).toEqual([]);
    expect(place.rating).toBeNull();
    expect(place.totalReviews).toBeNull();
  });

  it("rejects invalid reviews instead of inventing a zero rating", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          id: "test-place",
          displayName: { text: "Unit test fixture" },
          reviews: [{ text: { text: "fixture" } }],
        }),
      ),
    );
    await expect(resolveAndFetchPlace("test-key", url)).rejects.toMatchObject({
      code: "INVALID_PROVIDER_DATA",
    });
  });

  it("does not echo credentials from a provider error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("test-private-key", { status: 403 })),
    );
    await expect(resolveAndFetchPlace("test-private-key", url)).rejects.toMatchObject({
      code: "API_UNAVAILABLE",
    });
    await expect(resolveAndFetchPlace("test-private-key", url)).rejects.not.toThrow(
      "test-private-key",
    );
  });

  it("distinguishes rate limits from missing businesses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })));
    await expect(resolveAndFetchPlace("test-key", url)).rejects.toMatchObject({
      code: "RATE_LIMIT",
    });
  });
});
