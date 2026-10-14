import { afterEach, describe, expect, it, vi } from "vitest";
const cid = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("./google-cid.server", () => ({ resolveCidBusinessName: cid.resolve }));
import { parseMapsUrl, resolveAndFetchPlace, searchBusinesses } from "./google-places.server";

const url = "https://www.google.com/maps/search/?api=1&query_place_id=test-place&query=test";
const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ ...dns, default: dns }));
describe("Google Places boundary (unit fixtures, not scan evidence)", () => {
  it("follows the exact official share bridge to a Maps place without guessing identity", async () => {
    dns.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://www.google.com/share.google?q=unitShare" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: url } }))
      .mockResolvedValueOnce(Response.json({ id: "test-place", displayName: { text: "Fixture" } }));
    vi.stubGlobal("fetch", fetch);
    expect((await resolveAndFetchPlace("unit-key", "https://share.google/unitShare")).placeId).toBe(
      "test-place",
    );
    expect(fetch.mock.calls[0]?.[1].redirect).toBe("manual");
    expect(fetch.mock.calls[1]?.[1].redirect).toBe("manual");
  });
  it("returns name-search candidates with exact place-ID URLs, not an arbitrary automatic match", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        places: [
          {
            id: "unit-place",
            displayName: { text: "Unit Business" },
            formattedAddress: "Unit City",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const candidates = await searchBusinesses("unit-key", "Unit Business Unit City");
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.url).toContain("query_place_id=unit-place");
    expect(candidates[0]?.address).toBe("Unit City");
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toEqual({
      textQuery: "Unit Business Unit City",
      pageSize: 5,
    });
  });
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
  it("explains when a specific review link cannot identify a resolvable business", async () => {
    await expect(
      resolveAndFetchPlace(
        "test-key",
        "https://www.google.com/maps/reviews/data=!4m8!14m7!1m6!1sreview-id",
      ),
    ).rejects.toMatchObject({
      code: "INVALID_URL",
      message: expect.stringContaining("does not identify a business"),
    });
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

  it("rejects unresolved CID-only identity instead of guessing a business", async () => {
    cid.resolve.mockRejectedValueOnce(
      Object.assign(new Error("Identity unavailable"), { code: "UNSUPPORTED_LINK" }),
    );
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      resolveAndFetchPlace("test-key", "https://www.google.com/maps?cid=123"),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_LINK" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("resolves CID-only identity from official Maps and still requires exact CID match in Places", async () => {
    cid.resolve.mockResolvedValueOnce("Exact Apartment Name");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          places: [
            { id: "wrong", googleMapsUri: "https://www.google.com/maps?cid=999" },
            { id: "right", googleMapsUri: "https://www.google.com/maps?cid=123" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ id: "right", displayName: { text: "Exact Apartment Name" } }),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await resolveAndFetchPlace("fixture", "https://www.google.com/maps?cid=123");
    expect(result.placeId).toBe("right");
    expect(JSON.parse(fetch.mock.calls[0]![1].body).textQuery).toBe("Exact Apartment Name");
    expect(fetch.mock.calls[1]![0]).toContain("/places/right");
  });

  it("preserves business identity and prefers place coordinates over the camera centre", () => {
    expect(
      parseMapsUrl(
        "https://www.google.com/maps/place/The+Hudson/@1,2,17z/data=!1s0x123:0x7b!3d42.6894729!4d-73.8181503",
      ),
    ).toEqual({ query: "The Hudson", cid: "123", lat: 42.6894729, lng: -73.8181503 });
  });

  it("extracts encoded embedded place IDs", () => {
    expect(parseMapsUrl("https://www.google.com/maps/place/Test/data=!1sChIJtest%2Did")).toEqual({
      placeId: "ChIJtest-id",
    });
  });

  it("rejects invalid place coordinates", () => {
    expect(() => parseMapsUrl("https://www.google.com/maps/place/Test/data=!3d91!4d2")).toThrow(
      "coordinates",
    );
  });

  it("selects the CID-matching search result rather than the first nearby business", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          places: [
            { id: "wrong", googleMapsUri: "https://maps.google.com/?cid=456" },
            { id: "correct", googleMapsUri: "https://maps.google.com/?cid=123" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ id: "correct", displayName: { text: "Unit test fixture" } }),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await resolveAndFetchPlace(
      "test-key",
      "https://www.google.com/maps/place/Test/data=!1s0x123:0x7b!3d42!4d-73",
    );
    expect(result.placeId).toBe("correct");
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({
      textQuery: "Test",
      locationBias: { circle: { center: { latitude: 42, longitude: -73 } } },
    });
    expect(fetch.mock.calls[1]![0]).toContain("/places/correct");
  });

  it("rejects unmatched CID search results without fetching another business's reviews", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        places: [{ id: "wrong", googleMapsUri: "https://maps.google.com/?cid=456" }],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      resolveAndFetchPlace("test-key", "https://www.google.com/maps/place/Test/data=!1s0x123:0x7b"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("resolves a review-share CID using an existing verified business mapping", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ id: "known-place", displayName: { text: "Unit test fixture" } }),
      );
    vi.stubGlobal("fetch", fetch);
    const lookup = vi.fn().mockResolvedValue("known-place");
    const result = await resolveAndFetchPlace(
      "test-key",
      "https://www.google.com/maps/reviews/data=!1s0x0:0x7b",
      lookup,
    );
    expect(lookup).toHaveBeenCalledWith("123");
    expect(result.placeId).toBe("known-place");
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

  it("extracts the ISO country code from the business address components", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          id: "test-place",
          displayName: { text: "Unit test fixture" },
          addressComponents: [
            { longText: "United Kingdom", shortText: "GB", types: ["country", "political"] },
          ],
        }),
      ),
    );
    await expect(resolveAndFetchPlace("test-key", url)).resolves.toMatchObject({
      countryCode: "GB",
    });
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
