import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  generateAutomaticReplyDrafts,
  REPLY_AUTOMATION_INTERVAL_MS,
} from "./reply-automation.server";

describe("automatic reply draft scheduler", () => {
  it("is opt-in, runs every six hours, and makes no AI request without enabled users", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("[]", { headers: { "Content-Type": "application/json" } }));
    const db = createClient<Database>("https://db.example", "test-key", {
      global: { fetch: fetcher },
      auth: { persistSession: false },
    });

    expect(REPLY_AUTOMATION_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);
    await expect(
      generateAutomaticReplyDrafts(db, new Date("2026-10-12T06:00:00Z")),
    ).resolves.toEqual({
      generated: 0,
      failed: 0,
      attempted: 0,
      checked_at: "2026-10-12T06:00:00.000Z",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
