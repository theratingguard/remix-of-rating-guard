import { createFileRoute } from "@tanstack/react-router";
import { sensitiveApiRateLimit, rateLimitResponse } from "@/lib/rate-limit.server";
import { broadcastStaffSchema } from "@/lib/broadcast-schema";

const maximumBodyBytes = 12_000;

export const Route = createFileRoute("/api/broadcast")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const limited = await rateLimitResponse(request, sensitiveApiRateLimit);
        if (limited) return limited;
        try {
          const { readBroadcastOptions } = await import("@/lib/broadcast.server");
          const options = await readBroadcastOptions(request);
          return Response.json(options, {
            headers: { "Cache-Control": "no-store" },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Could not load broadcast options.";
          const status = /sign in|unauthorized/i.test(message)
            ? 401
            : /active manager access required/i.test(message)
              ? 403
              : 500;
          return Response.json(
            { error: message },
            { status, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
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
          const parsed = broadcastStaffSchema.safeParse(input);
          if (!parsed.success)
            return Response.json(
              { error: "Please enter valid broadcast details." },
              { status: 400 },
            );
          const { sendStaffBroadcast } = await import("@/lib/broadcast.server");
          const result = await sendStaffBroadcast(request, parsed.data);
          return Response.json(result, {
            status: 201,
            headers: { "Cache-Control": "no-store" },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Broadcast failed.";
          const status = /sign in|unauthorized/i.test(message)
            ? 401
            : /manager access|outside your|cannot broadcast|access denied|superadmin access required/i.test(
                  message,
                )
              ? 403
              : /enter|select|valid|audience|recipient|5000/i.test(message)
                ? 400
                : 500;
          return Response.json(
            { error: message },
            { status, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
    },
  },
});
