import { createFileRoute } from "@tanstack/react-router";
import { matchesWorkerSecret } from "@/lib/worker-auth.server";
import { rateLimitResponse, sensitiveApiRateLimit } from "@/lib/rate-limit.server";

export const Route = createFileRoute("/api/scan-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const limited = await rateLimitResponse(request, sensitiveApiRateLimit);
        if (limited) return limited;
        const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!matchesWorkerSecret(token, process.env["SCAN_WORKER_SECRET"]))
          return new Response("Unauthorized", { status: 401 });
        const { runWorker } = await import("@/lib/queue.server");
        return Response.json(await runWorker({ deadlineMs: 45_000 }));
      },
    },
  },
});
