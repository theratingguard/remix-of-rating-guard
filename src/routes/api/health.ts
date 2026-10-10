import { createFileRoute } from "@tanstack/react-router";

export function healthResponse(): Response {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "GOOGLE_PLACES_API_KEY",
    "OPENAI_API_KEY",
  ];
  const missing = required.filter((name) => !process.env[name]);
  return Response.json(
    {
      status: missing.length ? "degraded" : "configured",
      application: "responding",
      missingConfiguration: missing,
      providerVerification: "not_performed",
      queueConfigured:
        Boolean(process.env["SUPABASE_SERVICE_ROLE_KEY"]) &&
        process.env["SCAN_WORKER_SCHEDULED"] === "true",
    },
    { status: missing.length ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => healthResponse(),
    },
  },
});
