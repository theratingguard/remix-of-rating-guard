import { createFileRoute } from "@tanstack/react-router";
import { sensitiveApiRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

const maximumBodyBytes = 8_000;

export const Route = createFileRoute("/api/hierarchy/assign-task")({
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
          const { assignHierarchyTask, assignHierarchyTaskSchema } =
            await import("@/lib/hierarchy-dashboard.functions");
          const parsed = assignHierarchyTaskSchema.safeParse(input);
          if (!parsed.success)
            return Response.json({ error: "Please enter valid task details." }, { status: 400 });
          const result = await assignHierarchyTask({ data: parsed.data });
          return Response.json(result, {
            status: 201,
            headers: { "Cache-Control": "no-store" },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Task assignment failed.";
          const status = /sign in|unauthorized/i.test(message)
            ? 401
            : /active hierarchy|direct report|cannot assign|not authorized/i.test(message)
              ? 403
              : /valid|review URL|task title|too short|between|invalid/i.test(message)
                ? 400
                : 500;
          return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
        }
      },
    },
  },
});
