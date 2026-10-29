import { createFileRoute } from "@tanstack/react-router";
import { sensitiveApiRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";
import { generateBlogDraft } from "@/lib/blog-generator.server";

function responseForError(error: unknown) {
  const message = error instanceof Error ? error.message : "Blog generation failed.";
  const status = /Unauthorized/i.test(message)
    ? 401
    : /Super Admin access/i.test(message)
      ? 403
      : /keyword|incomplete/i.test(message)
        ? 400
        : /unavailable: configure/i.test(message)
          ? 503
          : 500;
  if (status >= 500) console.error("[blog-generator] Draft generation failed.", message);
  return Response.json(
    { error: status >= 500 ? "The blog draft could not be generated. Check server logs." : message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export const Route = createFileRoute("/api/admin/generate-blog")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = await rateLimitResponse(request, sensitiveApiRateLimit);
        if (limited) return limited;
        let body: unknown;
        try {
          const rawBody = await request.text();
          if (new TextEncoder().encode(rawBody).byteLength > 4096)
            return Response.json({ error: "Request body is too large." }, { status: 413 });
          body = JSON.parse(rawBody) as unknown;
        } catch {
          return Response.json({ error: "Invalid request body." }, { status: 400 });
        }
        if (!body || typeof body !== "object" || !("keyword" in body))
          return Response.json({ error: "A keyword is required." }, { status: 400 });
        try {
          const post = await generateBlogDraft(request, body.keyword);
          return Response.json(post, {
            status: 201,
            headers: { "Cache-Control": "no-store" },
          });
        } catch (error) {
          return responseForError(error);
        }
      },
    },
  },
});
