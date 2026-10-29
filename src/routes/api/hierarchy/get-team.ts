import { createFileRoute } from "@tanstack/react-router";
import { getHierarchyDashboardData } from "@/lib/hierarchy-dashboard.functions";
import { rateLimitResponse, sensitiveApiRateLimit } from "@/lib/rate-limit.server";

export const Route = createFileRoute("/api/hierarchy/get-team")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const limited = await rateLimitResponse(request, sensitiveApiRateLimit);
        if (limited) return limited;
        try {
          const data = await getHierarchyDashboardData();
          return Response.json(data, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not load team data.";
          const status = /sign in|unauthorized/i.test(message)
            ? 401
            : /active hierarchy|forbidden|access required/i.test(message)
              ? 403
              : 500;
          return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
        }
      },
    },
  },
});
