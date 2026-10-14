import { createFileRoute } from "@tanstack/react-router";
import { storageErrorResponse } from "@/lib/storage-http.server";

export const Route = createFileRoute("/api/storage/delete")({
  server: {
    handlers: {
      DELETE: async ({ request }) => {
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
