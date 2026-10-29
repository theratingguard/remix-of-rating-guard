import { createFileRoute } from "@tanstack/react-router";
import { sensitiveApiRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";

const maximumBodyBytes = 7_500_000;

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "User creation failed.";
  const status = /unauthorized|sign in/i.test(message)
    ? 401
    : /Super Admin access/i.test(message)
      ? 403
      : /already in use/i.test(message)
        ? 409
        : /select|mandatory|valid|invalid|must be|between|too small|too big/i.test(message)
          ? 400
          : 500;
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export const Route = createFileRoute("/api/super-admin/add-user")({
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
        let data: unknown;
        try {
          data = JSON.parse(body);
        } catch {
          return Response.json({ error: "Invalid request body." }, { status: 400 });
        }

        try {
          const { addUserAsSuperAdmin, superAdminUserSchema } =
            await import("@/lib/user-creation.functions");
          const parsed = superAdminUserSchema.safeParse(data);
          if (!parsed.success)
            return Response.json(
              { error: "Please enter valid user details." },
              { status: 400, headers: { "Cache-Control": "no-store" } },
            );
          const created = await addUserAsSuperAdmin({ data: parsed.data });
          return Response.json(created, {
            status: 201,
            headers: { "Cache-Control": "no-store" },
          });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
