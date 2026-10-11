import { describe, expect, it, vi } from "vitest";
import { checkRemovalStatus } from "./status-polling.server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

describe("submission follow-up", () => {
  it("checks local pending records with service RPC, never calls Google", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/submission_status?")) {
        expect(url).toContain("status=eq.submitted");
        return new Response(JSON.stringify([{ id: "status", removal_request_id: "request" }]), {
          headers: { "Content-Type": "application/json" },
        });
      }
      expect(url).toBe("https://db.example/rest/v1/rpc/record_submission_followup");
      expect(JSON.parse(String(init?.body))).toEqual({
        p_request_id: "request",
        p_checked_at: "2026-10-11T06:00:00.000Z",
      });
      return new Response("true", { headers: { "Content-Type": "application/json" } });
    });
    const db = createClient<Database>("https://db.example", "test-key", {
      global: { fetch: fetcher },
      auth: { persistSession: false },
    });
    const result = await checkRemovalStatus(db, new Date("2026-10-11T06:00:00Z"));
    expect(result).toMatchObject({ checked: 1, google_polled: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("surfaces database failure without reporting a successful check", async () => {
    const db = createClient<Database>("https://db.example", "test-key", {
      global: {
        fetch: async () =>
          new Response(JSON.stringify({ message: "Database denied" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }),
      },
      auth: { persistSession: false },
    });
    await expect(checkRemovalStatus(db)).rejects.toMatchObject({ message: "Database denied" });
  });
});
