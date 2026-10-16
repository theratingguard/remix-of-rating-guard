import { createFileRoute } from "@tanstack/react-router";
import { storageErrorResponse } from "@/lib/storage-http.server";
import { validateStorageFilename, validateStorageFolder } from "@/lib/storage";
import { generalApiRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

export const Route = createFileRoute("/api/storage/download")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const limited = await rateLimitResponse(request, generalApiRateLimit);
        if (limited) return limited;
        try {
          const query = new URL(request.url).searchParams;
          const folder = query.get("folder") ?? "";
          const filename = query.get("filename") ?? "";
          const { authorizeStorageFile } = await import("@/lib/storage.functions");
          await authorizeStorageFile({ data: { folder, filename } });
          const { storage } = await import("@/lib/storage.server");
          const { stream, size } = await storage.readStream(folder, filename);
          const safeName = validateStorageFilename(filename);
          const isPdf = safeName.toLowerCase().endsWith(".pdf");
          const contentType = isPdf ? "application/pdf" : "application/octet-stream";
          const disposition = isPdf ? "inline" : "attachment";
          return new Response(stream, {
            status: 200,
            headers: {
              "Content-Type": contentType,
              "Content-Disposition": `${disposition}; filename="${safeName}"`,
              "Content-Length": String(size),
              "Cache-Control": "private, no-store",
              "X-Frame-Options": "DENY",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch (error) {
          return storageErrorResponse(error, "download");
        }
      },
    },
  },
});
