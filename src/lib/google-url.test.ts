import { describe, expect, it } from "vitest";
import { isGoogleMapsUrl, normalizeGoogleUrl } from "./google-url";
import { isPublicAddress } from "./google-places.server";

describe("Google URL and network admission", () => {
  it.each([
    "https://google.com.maps.app.attacker.com/maps/place/Test",
    "https://maps.google.com.attacker.com/maps",
    "https://google.com@127.0.0.1/maps",
    "https://user:password@www.google.com/maps",
    "http://www.google.com/maps",
    "https://www.google.com:8443/maps",
    "https://127.0.0.1/maps",
    "https://[::1]/maps",
    "https://www.google.com/other",
  ])("rejects %s", (url) => expect(isGoogleMapsUrl(url)).toBe(false));

  it.each([
    "https://www.google.com/maps/place/Test",
    "https://maps.app.goo.gl/ABC",
    "https://www.google.co.in/maps?query_place_id=Test",
    "https://g.co/kgs/ABC",
  ])("accepts supported provider URL %s", (url) => expect(isGoogleMapsUrl(url)).toBe(true));
  it("preserves case-sensitive short links and query values", () => {
    expect(normalizeGoogleUrl("https://maps.app.goo.gl/AbC#fragment")).toBe(
      "https://maps.app.goo.gl/AbC",
    );
    expect(normalizeGoogleUrl("https://www.google.com/maps?query_place_id=AbC")).toContain("AbC");
  });
  it.each([
    "127.0.0.1",
    "10.1.1.1",
    "172.16.0.1",
    "192.168.1.2",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
  ])("rejects private/special address %s", (address) =>
    expect(isPublicAddress(address)).toBe(false),
  );
});
