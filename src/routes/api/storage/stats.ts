import { createFileRoute } from "@tanstack/react-router";
import { storageErrorResponse } from "@/lib/storage-http.server";
import { generalApiRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

export const Route = createFileRoute("/api/storage/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const limited = await rateLimitResponse(request, generalApiRateLimit);
        if (limited) return limited;
        try {
          const { getStorageDashboard } = await import("@/lib/storage.functions");
          return Response.json(await getStorageDashboard(), {
            headers: { "Cache-Control": "private, no-store" },
          });
        } catch (error) {
          return storageErrorResponse(error, "stats");
        }
      },
    },
  },
});
