import { createFileRoute } from "@tanstack/react-router";
import { storageErrorResponse } from "@/lib/storage-http.server";
import { generalApiRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

export const Route = createFileRoute("/api/storage/delete")({
  server: {
    handlers: {
      DELETE: async ({ request }) => {
        const limited = await rateLimitResponse(request, generalApiRateLimit);
        if (limited) return limited;
        try {
          const payload = await request.json();
          const { deleteStorageFile } = await import("@/lib/storage.functions");
          return Response.json(await deleteStorageFile({ data: payload }), {
            headers: { "Cache-Control": "private, no-store" },
          });
        } catch (error) {
          return storageErrorResponse(error, "delete");
        }
      },
    },
  },
});
