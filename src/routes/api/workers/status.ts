import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/workers/status")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { getWorkersStatus } = await import("@/lib/workers-status.functions");
          return Response.json(await getWorkersStatus(), {
            headers: { "Cache-Control": "no-store" },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Worker status unavailable.";
          console.error("[workers-status]", message);
          return Response.json(
            { error: message },
            {
              status: /Unauthorized/.test(message)
                ? 401
                : /Access Denied/.test(message)
                  ? 403
                  : 503,
              headers: { "Cache-Control": "no-store" },
            },
          );
        }
      },
    },
  },
});
