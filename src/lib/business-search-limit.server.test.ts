import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  BUSINESS_SEARCH_LIMIT_PER_HOUR,
  reserveBusinessSearchSlot,
} from "./business-search-limit.server";

const migration = await readFile(
  "supabase/migrations/20261015200000_report_summary_search_rate_limit.sql",
  "utf8",
);

describe("business search admission", () => {
  it("reserves a search when the database admits it", async () => {
    const reserve = vi.fn().mockResolvedValue({ error: null });

    await expect(reserveBusinessSearchSlot(reserve)).resolves.toBeUndefined();
    expect(reserve).toHaveBeenCalledOnce();
  });

  it("returns a clear limit message when the per-user hourly cap is reached", async () => {
    const reserve = vi.fn().mockResolvedValue({
      error: { message: "Business search rate limit exceeded" },
    });

    await expect(reserveBusinessSearchSlot(reserve)).rejects.toThrow(
      `Business search limit reached (${BUSINESS_SEARCH_LIMIT_PER_HOUR} per hour).`,
    );
  });

  it("does not expose unexpected database errors to the caller", async () => {
    const reserve = vi.fn().mockResolvedValue({
      error: { message: "internal database detail" },
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(reserveBusinessSearchSlot(reserve)).rejects.toThrow(
      "Business search is temporarily unavailable.",
    );
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });

  it("fails closed and sanitizes a rejected rate-limit request", async () => {
    const reserve = vi.fn().mockRejectedValue(new Error("database offline"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(reserveBusinessSearchSlot(reserve)).rejects.toThrow(
      "Business search is temporarily unavailable.",
    );
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});

describe("report summary migration", () => {
  it("limits summaries to their owner except for the designated super admin", () => {
    expect(migration).toMatch(/s\.user_id\s*=\s*auth\.uid\(\)/i);
    expect(migration).toMatch(/public\.report_access_level\(\)\s*=\s*'super_admin'/i);
    expect(migration).toMatch(/where\s+auth\.uid\(\)\s+is\s+not\s+null/i);
  });

  it("reserves no more than 30 business searches per user in each one-hour window", () => {
    expect(migration).toMatch(/reserved_count\s*>\s*30/i);
    expect(migration).toMatch(/interval\s+'1 hour'/i);
    expect(migration).toMatch(/pg_advisory_xact_lock/i);
  });
});
