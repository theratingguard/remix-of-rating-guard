import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/extension/report/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          if (!request.headers.get("authorization")?.startsWith("Bearer "))
            return Response.json(
              { error: "Unauthorized: A signed-in user session is required." },
              { status: 401, headers: { "Cache-Control": "no-store" } },
            );
          const { getExtensionReport } = await import("@/lib/extension.functions");
          return Response.json(await getExtensionReport({ data: { scanId: params.id } }), {
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
