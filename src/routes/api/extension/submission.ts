import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/extension/submission")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!request.headers.get("authorization")?.startsWith("Bearer "))
            return Response.json(
              { error: "Unauthorized: A signed-in user session is required." },
              { status: 401, headers: { "Cache-Control": "no-store" } },
            );
          const { recordExtensionSubmission } = await import("@/lib/extension.functions");
          const { extensionSubmissionSchema } = await import("@/lib/extension.functions");
          const body = extensionSubmissionSchema.parse(await request.json());
          return Response.json(await recordExtensionSubmission({ data: body }), {
            headers: { "Cache-Control": "private, no-store" },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Submission could not be recorded";
          console.error("[extension-submission]", message);
          return Response.json(
            { error: message },
            {
              status: /Unauthorized/.test(message)
                ? 401
                : /Access Denied/.test(message)
                  ? 403
                  : /duplicate|unique/i.test(message)
                    ? 409
                    : 400,
              headers: { "Cache-Control": "no-store" },
            },
          );
        }
      },
    },
  },
});
