import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/extension/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          if (!request.headers.get("authorization")?.startsWith("Bearer "))
            return Response.json(
              { error: "Unauthorized: A signed-in user session is required." },
              { status: 401, headers: { "Cache-Control": "no-store" } },
            );
          const { getExtensionStatus } = await import("@/lib/extension.functions");
          return Response.json(await getExtensionStatus(), {
            headers: { "Cache-Control": "private, no-store" },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Extension status unavailable";
          console.error("[extension-status]", message);
          return Response.json(
            { error: message },
            {
              status: /Unauthorized/.test(message)
                ? 401
                : /Access Denied/.test(message)
                  ? 403
                  : 500,
              headers: { "Cache-Control": "no-store" },
            },
          );
        }
      },
    },
  },
});
