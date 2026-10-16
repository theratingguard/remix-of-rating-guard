import { describe, expect, it } from "vitest";
import {
  createMemoryRateLimitStore,
  rateLimitResponse,
  type RateLimitStore,
} from "@/lib/rate-limit.server";

describe("API rate limiter", () => {
  it("allows up to the configured limit and returns 429 thereafter", async () => {
    const store = createMemoryRateLimitStore();
    const request = new Request("https://example.test/api/health", {
      headers: { "cf-connecting-ip": "192.0.2.10" },
    });
    const policy = { name: "test", limit: 60, windowMs: 60_000 };
    const responses = await Promise.all(
      Array.from({ length: 100 }, () => rateLimitResponse(request, policy, store)),
    );
    expect(responses.slice(0, 60).every((response) => response === null)).toBe(true);
    expect(responses.slice(60).every((response) => response?.status === 429)).toBe(true);
    expect(responses[60]?.headers.get("retry-after")).toBeTruthy();
  });

  it("isolates client IPs and returns a safe 503 if the shared store fails", async () => {
    const store = createMemoryRateLimitStore();
    const policy = { name: "test", limit: 1, windowMs: 60_000 };
    const first = new Request("https://example.test", {
      headers: { "cf-connecting-ip": "192.0.2.11" },
    });
    const second = new Request("https://example.test", {
      headers: { "cf-connecting-ip": "192.0.2.12" },
    });
    await rateLimitResponse(first, policy, store);
    expect(await rateLimitResponse(second, policy, store)).toBeNull();

    const broken: RateLimitStore = {
      increment: async () => {
        throw new Error("connection password=private");
      },
    };
    const unavailable = await rateLimitResponse(first, policy, broken);
    expect(unavailable?.status).toBe(503);
    expect(await unavailable?.text()).not.toContain("private");
  });
});
