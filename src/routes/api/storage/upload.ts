import { createFileRoute } from "@tanstack/react-router";
import { storageErrorResponse } from "@/lib/storage-http.server";
import { generalApiRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

export const Route = createFileRoute("/api/storage/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = await rateLimitResponse(request, generalApiRateLimit);
        if (limited) return limited;
        try {
          const { uploadStorageFile } = await import("@/lib/storage.functions");
          const form = await request.formData();
          const file = form.get("file");
          const folder = form.get("folder");
          if (!(file instanceof Blob) || typeof folder !== "string")
            return Response.json(
              { error: "Upload requires a file and folder." },
              { status: 400, headers: { "Cache-Control": "no-store" } },
            );
          if (file.size > 24 * 1024 * 1024)
            return Response.json(
              { error: "File exceeds the 24 MB upload limit." },
              { status: 413, headers: { "Cache-Control": "no-store" } },
            );
          const result = await uploadStorageFile({
            data: {
              folder,
              filename: "name" in file && typeof file.name === "string" ? file.name : "",
              contentType: file.type || "application/octet-stream",
              base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
            },
          });
          return Response.json(result, {
            status: 201,
            headers: { "Cache-Control": "private, no-store" },
          });
        } catch (error) {
          return storageErrorResponse(error, "upload");
        }
      },
    },
  },
});
