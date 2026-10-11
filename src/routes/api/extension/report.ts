import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/extension/report")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { getExtensionReport } = await import("@/lib/extension.functions");
          const scanId = new URL(request.url).searchParams.get("scanId");
          return Response.json(await getExtensionReport({ data: { scanId } }), {
            headers: { "Cache-Control": "private, no-store" },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Extension report unavailable";
          console.error("[extension-report]", message);
          return Response.json(
            { error: message },
            {
              status: /Unauthorized/.test(message)
                ? 401
                : /Access Denied/.test(message)
                  ? 403
                  : 400,
              headers: { "Cache-Control": "no-store" },
            },
          );
        }
      },
    },
  },
});
