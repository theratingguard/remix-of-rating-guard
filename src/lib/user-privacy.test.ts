import { describe, expect, it } from "vitest";
import { maskUserData } from "./user-privacy";

describe("maskUserData", () => {
  const profile = {
    unique_id: "84729104",
    role: "Staff",
    team_id: "team-1",
    name: "Private Name",
    email: "private@example.com",
    photo_url: "https://example.com/private.webp",
  };

  it("returns only the public identifiers for non-admins", () => {
    expect(maskUserData(profile, "Manager")).toEqual({
      unique_id: "84729104",
      role: "Staff",
      team_id: "team-1",
    });
  });

  it("preserves full details for Super Admin", () => {
    expect(maskUserData(profile, "super_admin")).toEqual(profile);
  });
});
