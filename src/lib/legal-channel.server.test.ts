import { describe, expect, it } from "vitest";
import { selectLegalChannel } from "./legal-channel.server";

describe("Google Maps policy channel selection", () => {
  it.each([
    ["Fake Engagement", "Fake Engagement"],
    ["Conflict of Interest", "Conflict of Interest"],
    ["Defamation", "Harassment/Defamation"],
    ["Spam", "Spam"],
    ["Unclear", null],
  ] as const)("maps %s to %s", (policy, channel) => {
    expect(selectLegalChannel(policy, "https://maps.google.com/?cid=123").channel).toBe(channel);
  });

  it("never fabricates a Google submission form and rejects non-Maps URLs", () => {
    expect(selectLegalChannel("Spam", "https://example.com").google_form_url).toBeNull();
    expect(selectLegalChannel("Spam", "https://example.com").review_url).toBeNull();
  });
});
