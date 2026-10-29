import { createFileRoute } from "@tanstack/react-router";
import { rateLimitResponse, sensitiveApiRateLimit } from "@/lib/rate-limit.server";
import { generateBacklinkOutreach } from "@/lib/seo/backlink-outreach.server";

export const Route = createFileRoute("/api/admin/generate-backlink-outreach")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = await rateLimitResponse(request, sensitiveApiRateLimit);
        if (limited) return limited;
        let body: unknown;
        try {
          const raw = await request.text();
          if (new TextEncoder().encode(raw).byteLength > 2048)
            return Response.json({ error: "Request body is too large." }, { status: 413 });
          body = JSON.parse(raw) as unknown;
        } catch {
          return Response.json({ error: "Invalid JSON request." }, { status: 400 });
        }
        if (!body || typeof body !== "object" || !("targetId" in body))
          return Response.json({ error: "A targetId is required." }, { status: 400 });
        try {
          const draft = await generateBacklinkOutreach(request, body.targetId);
          return Response.json(draft, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Outreach generation failed.";
          const status = /Unauthorized/i.test(message)
            ? 401
            : /Super Admin access/i.test(message)
              ? 403
              : /valid backlink target|required|exists/i.test(message)
                ? 400
                : 500;
          if (status === 500) console.error("[backlink-outreach] Draft generation failed.", message);
          return Response.json(
            { error: status === 500 ? "Could not generate the draft. Check server logs." : message },
            { status, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
    },
  },
});
