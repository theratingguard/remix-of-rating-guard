import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options }),
}));
import { healthResponse } from "@/routes/api/health";

describe("Public health contract", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reports missing configuration and database access as degraded", async () => {
    for (const name of [
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "GOOGLE_PLACES_API_KEY",
      "OPENAI_API_KEY",
    ])
      vi.stubEnv(name, "");

    const result = await healthResponse();
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({
      status: "degraded",
      database: "unavailable",
      databaseVerification: "failed",
      providerVerification: "unverified",
      missingConfiguration: expect.arrayContaining(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]),
    });
  });

  it("checks Supabase database connectivity without returning credentials", async () => {
    for (const name of [
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "GOOGLE_PLACES_API_KEY",
      "OPENAI_API_KEY",
    ])
      vi.stubEnv(name, `unit-secret-${name}`);
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");

    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe("https://project.supabase.co/rest/v1/staff?select=id&limit=0");
      expect(new Headers(init?.headers).get("apikey")).toBe(
        "unit-secret-SUPABASE_SERVICE_ROLE_KEY",
      );
      return new Response(null, { status: 200 });
    });

    const response = await healthResponse({ fetcher });
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(body).not.toContain("unit-secret");
    expect(body).toContain('"database":"available"');
    expect(body).toContain('"databaseVerification":"verified"');
    expect(body).toContain('"providerVerification":"unverified"');
  });

  it("fails health when Supabase is unreachable", async () => {
    for (const name of [
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "GOOGLE_PLACES_API_KEY",
      "OPENAI_API_KEY",
    ])
      vi.stubEnv(name, `unit-secret-${name}`);
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await healthResponse({
      fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error("network unavailable")),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "degraded",
      database: "unavailable",
      databaseVerification: "failed",
      providerVerification: "unverified",
    });
  });

  it("keeps health successful when Supabase is available but other providers are unconfigured", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "unit-publishable-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "unit-service-role-key");
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");

    const response = await healthResponse({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 })),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "healthy",
      database: "available",
      missingConfiguration: expect.arrayContaining(["GOOGLE_PLACES_API_KEY", "OPENAI_API_KEY"]),
    });
  });
});
