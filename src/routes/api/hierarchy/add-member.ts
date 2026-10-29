import { createFileRoute } from "@tanstack/react-router";
import { sensitiveApiRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

const maximumBodyBytes = 16_000;

export const Route = createFileRoute("/api/hierarchy/add-member")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = await rateLimitResponse(request, sensitiveApiRateLimit);
        if (limited) return limited;
        if (Number(request.headers.get("content-length") ?? 0) > maximumBodyBytes)
          return Response.json({ error: "Request body is too large." }, { status: 413 });

        const body = await request.text();
        if (new TextEncoder().encode(body).byteLength > maximumBodyBytes)
          return Response.json({ error: "Request body is too large." }, { status: 413 });
        let input: unknown;
        try {
          input = JSON.parse(body);
        } catch {
          return Response.json({ error: "Invalid request body." }, { status: 400 });
        }

        try {
          const { createHierarchyReport, hierarchyReportSchema } =
            await import("@/lib/user-creation.functions");
          const parsed = hierarchyReportSchema.safeParse(input);
          if (!parsed.success)
            return Response.json({ error: "Please enter valid member details." }, { status: 400 });
          const created = await createHierarchyReport({ data: parsed.data });
          return Response.json(created, {
            status: 201,
            headers: { "Cache-Control": "no-store" },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Member creation failed.";
          const status = /sign in|unauthorized/i.test(message)
            ? 401
            : /active hierarchy|direct report|forbidden|access required/i.test(message)
              ? 403
              : /already (in use|registered)|duplicate/i.test(message)
                ? 409
                : /valid|select|too short|between/i.test(message)
                  ? 400
                  : 500;
          return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
        }
      },
    },
  },
});
