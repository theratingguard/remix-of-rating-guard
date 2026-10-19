import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { profileQuery } from "./profile";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileMaybeSingle: vi.fn(),
  staffMaybeSingle: vi.fn(),
  resellerMaybeSingle: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      const maybeSingle =
        table === "profiles"
          ? mocks.profileMaybeSingle
          : table === "staff"
            ? mocks.staffMaybeSingle
            : mocks.resellerMaybeSingle;
      return {
        select: () => ({
          eq: () => ({ maybeSingle }),
        }),
      };
    },
    storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) },
  },
}));

describe("profile query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "person@example.com",
          last_sign_in_at: null,
          app_metadata: { role: "client" },
        },
      },
    });
    mocks.profileMaybeSingle.mockResolvedValue({
      data: {
        name: "Person",
        username: "person",
        phone: "+15551234567",
        company_name: "Example Co",
        business_name: "Example Group",
        website_url: "https://example.com",
        address: "123 Market Street",
        business_type: "Restaurant",
        email_notifications: false,
        language: "hi",
        timezone: "Asia/Kolkata",
        avatar_path: null,
        avatar_url: "https://assets.example.com/person.png",
        banner_url: "https://assets.example.com/banner.png",
        status: "active",
      },
      error: null,
    });
    mocks.staffMaybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.resellerMaybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it("returns saved account profile fields and preferences", async () => {
    const profile = await new QueryClient().fetchQuery(profileQuery());

    expect(profile).toMatchObject({
      name: "Person",
      username: "person",
      email: "person@example.com",
      phone: "+15551234567",
      address: "123 Market Street",
      companyName: "Example Group",
      websiteUrl: "https://example.com",
      businessType: "Restaurant",
      avatarUrl: "https://assets.example.com/person.png",
      bannerUrl: "https://assets.example.com/banner.png",
      emailNotifications: false,
      language: "hi",
      timezone: "Asia/Kolkata",
    });
  });

  it("uses safe defaults for preference columns when older profile rows are null", async () => {
    mocks.profileMaybeSingle.mockResolvedValueOnce({
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

  it("uses staff contact details as the source of truth for staff accounts", async () => {
    mocks.staffMaybeSingle.mockResolvedValue({
      data: { name: "Staff Name", mobile: "+919876543210", address: "Staff office" },
      error: null,
    });

    const profile = await new QueryClient().fetchQuery(profileQuery());

    expect(profile).toMatchObject({
      name: "Staff Name",
      phone: "+919876543210",
      address: "Staff office",
    });
  });

  it("uses reseller contact details as the source of truth for reseller accounts", async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: {
        user: {
          id: "user-1",
          email: "partner@example.com",
          last_sign_in_at: null,
          app_metadata: { role: "reseller" },
        },
      },
    });
    mocks.profileMaybeSingle.mockResolvedValueOnce({
      data: { name: "Partner", phone: null, avatar_path: null },
      error: null,
    });
    mocks.resellerMaybeSingle.mockResolvedValueOnce({
      data: { mobile: "+919876543210" },
      error: null,
    });

    const profile = await new QueryClient().fetchQuery(profileQuery());

    expect(profile.phone).toBe("+919876543210");
  });
});
