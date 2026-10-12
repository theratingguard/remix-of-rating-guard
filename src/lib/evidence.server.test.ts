import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { collectReviewEvidence } from "./evidence.server";

afterEach(() => vi.unstubAllGlobals());

describe("Google Places evidence capture", () => {
  it("persists a timestamped content fingerprint and explicitly marks unsupported evidence checks", async () => {
    const writes: Record<string, unknown>[] = [];
    const client = createClient<Database>("https://unit-fixture.supabase.co", "fixture", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (_input, init) => {
          writes.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          return Response.json({
            id: "00000000-0000-4000-8000-000000000002",
            ...writes[0],
          });
        },
      },
    });

    const result = await collectReviewEvidence(client, {
      reviewId: "00000000-0000-4000-8000-000000000001",
      text: "Food bahut acha tha, paid to write fake reviews.",
      reviewUrl: "https://www.google.com/maps/reviews/example",
      author: "Google reviewer",
      authorUri: "https://www.google.com/maps/contrib/123",
      rating: 1,
    });

    expect(result.screenshot_url).toBeNull();
    expect(result.review_url).toBe("https://www.google.com/maps/reviews/example");
    expect(Date.parse(String(result.captured_at))).not.toBeNaN();
    expect(result.metadata).toMatchObject({
      source: "google_places",
      screenshot: { status: "unavailable" },
      reviewer_profile: {
        status: "attribution_url_available_only",
        profile_contents_checked: false,
      },
      cross_platform_check: { status: "not_performed" },
      language: { language: "hinglish" },
    });
    expect(writes[0]?.["content_hash"]).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("does not accept a non-Maps review URL as evidence", async () => {
    const client = createClient<Database>("https://unit-fixture.supabase.co", "fixture", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (_input, init) => {
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          expect(body["review_url"]).toBeNull();
          return Response.json({ id: "00000000-0000-4000-8000-000000000003", ...body });
        },
      },
    });

    const result = await collectReviewEvidence(client, {
      reviewId: "00000000-0000-4000-8000-000000000001",
      text: null,
      reviewUrl: "https://example.com/review",
      author: null,
      authorUri: null,
      rating: 2,
    });
    expect(result.review_url).toBeNull();
  });
});
