import { createFileRoute } from "@tanstack/react-router";
import { storageErrorResponse } from "@/lib/storage-http.server";
import { generalApiRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

export const Route = createFileRoute("/api/storage/list")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const limited = await rateLimitResponse(request, generalApiRateLimit);
        if (limited) return limited;
        try {
          const folder = new URL(request.url).searchParams.get("folder") ?? "";
          const { listStorageFiles } = await import("@/lib/storage.functions");
          const result = await listStorageFiles({ data: { folder } });
          const files = result.files.map((file) => {
            const path = file.path.split("/");
            const filename = path.pop();
            const fileFolder = [folder, ...path].join("/");
            return {
              ...file,
              url: filename
                ? `/api/storage/download?folder=${encodeURIComponent(fileFolder)}&filename=${encodeURIComponent(filename)}`
                : null,
            };
          });
          return Response.json({ files }, { headers: { "Cache-Control": "private, no-store" } });
        } catch (error) {
          return storageErrorResponse(error, "list");
        }
      },
    },
  },
});
