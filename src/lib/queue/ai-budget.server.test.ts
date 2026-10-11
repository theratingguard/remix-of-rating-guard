import { afterEach, describe, expect, it, vi } from "vitest";
const reservation = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: reservation } }));
import { boundAiRequest, budgetedAiFetch } from "./ai-budget.server";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("Fail-closed daily AI reservation guard", () => {
  it("bounds output and accounts for all input bytes including retry corrections", () => {
    const first = boundAiRequest("https://api.openai.com/v1/responses", {
      body: JSON.stringify({ model: "gpt-4o", input: "source" }),
    });
    const next = boundAiRequest("https://api.openai.com/v1/responses", {
      body: JSON.stringify({ model: "gpt-4o", input: "source", correction: "extra".repeat(500) }),
    });
    expect(JSON.parse(first.body).max_output_tokens).toBe(6000);
    expect(first.cost).toBeGreaterThan(0);
    expect(next.cost).toBeGreaterThan(first.cost);
  });
  it("does not call a paid provider when the atomic daily limit is exhausted", async () => {
    vi.stubEnv("MULTI_WORKER_ENABLED", "true");
    reservation.mockReturnValue({ throwOnError: async () => ({ data: false }) });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      budgetedAiFetch("https://api.openai.com/v1/responses", { body: '{"model":"gpt-4o"}' }),
    ).rejects.toMatchObject({ code: "AI_BUDGET_LIMIT" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not bypass an unavailable budget ledger", async () => {
    vi.stubEnv("MULTI_WORKER_ENABLED", "true");
    reservation.mockReturnValue({
      throwOnError: async () => {
        throw Error("Ledger offline");
      },
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      budgetedAiFetch("https://api.openai.com/v1/responses", { body: '{"model":"gpt-4o"}' }),
    ).rejects.toThrow("Ledger offline");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects unknown model prices and excessive output caps", () => {
    expect(() =>
      boundAiRequest("https://api.openai.com/v1/responses", { body: '{"model":"unknown"}' }),
    ).toThrow();
    expect(() =>
      boundAiRequest("https://api.openai.com/v1/responses", {
        body: '{"model":"gpt-4o","max_output_tokens":100000}',
      }),
    ).toThrow();
  });
});
