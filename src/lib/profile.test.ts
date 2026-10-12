import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { profileQuery } from "./profile";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mocks.maybeSingle }),
      }),
    }),
    storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) },
  },
}));

describe("profile query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "person@example.com", last_sign_in_at: null } },
    });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        name: "Person",
        username: "person",
        phone: "+15551234567",
        company_name: "Example Co",
        business_type: "Restaurant",
        email_notifications: false,
        language: "hi",
        timezone: "Asia/Kolkata",
        avatar_path: null,
        status: "active",
      },
      error: null,
    });
  });

  it("returns saved account profile fields and preferences", async () => {
    const profile = await new QueryClient().fetchQuery(profileQuery());

    expect(profile).toMatchObject({
      name: "Person",
      username: "person",
      email: "person@example.com",
      phone: "+15551234567",
      companyName: "Example Co",
      businessType: "Restaurant",
      emailNotifications: false,
      language: "hi",
      timezone: "Asia/Kolkata",
    });
  });

  it("uses safe defaults for preference columns when older profile rows are null", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        name: "Person",
        username: null,
        phone: null,
        company_name: null,
        business_type: null,
        email_notifications: null,
        language: null,
        timezone: null,
        avatar_path: null,
        status: "active",
      },
      error: null,
    });

    const profile = await new QueryClient().fetchQuery(profileQuery());

    expect(profile.emailNotifications).toBe(true);
    expect(profile.language).toBe("en");
    expect(profile.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});
