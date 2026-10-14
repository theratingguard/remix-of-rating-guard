import { createFileRoute } from "@tanstack/react-router";
import { storageErrorResponse } from "@/lib/storage-http.server";

export const Route = createFileRoute("/api/storage/stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
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
