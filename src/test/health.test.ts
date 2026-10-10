import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options }),
}));
import { healthResponse } from "@/routes/api/health";

describe("Public health contract", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("reports missing configuration as degraded, without secrets", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const result = healthResponse();
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({
      status: "degraded",
      providerVerification: "not_performed",
    });
  });
  it("distinguishes configured from live provider verification", async () => {
    for (const name of [
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "GOOGLE_PLACES_API_KEY",
      "OPENAI_API_KEY",
    ])
      vi.stubEnv(name, "unit-secret");
    const response = healthResponse();
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain("unit-secret");
    expect(body).toContain("not_performed");
  });
});
