import { createFileRoute } from "@tanstack/react-router";
import { generalApiRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

type HealthDependencies = {
  fetcher?: typeof fetch;
};

export async function healthResponse({
  fetcher = fetch,
}: HealthDependencies = {}): Promise<Response> {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "GOOGLE_PLACES_API_KEY",
    "OPENAI_API_KEY",
  ];
  const missing = required.filter((name) => !process.env[name]);
  const supabaseUrl = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  let databaseAvailable = false;

  if (supabaseUrl && serviceRoleKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const databaseUrl = new URL("/rest/v1/staff?select=id&limit=0", supabaseUrl);
      const response = await fetcher(databaseUrl, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        signal: controller.signal,
      });
      databaseAvailable = response.ok;
      if (!response.ok)
        console.error(`[health] Supabase database probe returned HTTP ${response.status}`);
      await response.body?.cancel();
    } catch (error) {
      const reason = error instanceof Error ? error.name : "UnknownError";
      console.error(`[health] Supabase database probe failed: ${reason}`);
    } finally {
      clearTimeout(timeout);
    }
  } else {
    console.error("[health] Supabase database probe is missing server credentials");
  }

  if (!supabaseUrl || !serviceRoleKey) {
    for (const name of [
      ...(!supabaseUrl ? ["SUPABASE_URL"] : []),
      ...(!serviceRoleKey ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
    ])
      if (!missing.includes(name)) missing.push(name);
  }

  const healthy = databaseAvailable;
  return Response.json(
    {
      status: healthy ? "healthy" : "degraded",
      application: "responding",
      missingConfiguration: missing,
      database: databaseAvailable ? "available" : "unavailable",
      databaseVerification: databaseAvailable ? "verified" : "failed",
      providerVerification: "unverified",
      queueConfigured:
        Boolean(process.env["SUPABASE_SERVICE_ROLE_KEY"]) &&
        process.env["SCAN_WORKER_SCHEDULED"] === "true",
    },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const limited = await rateLimitResponse(request, generalApiRateLimit);
        return limited ?? healthResponse();
      },
    },
  },
});
