import { createFileRoute } from "@tanstack/react-router";
import { matchesWorkerSecret } from "@/lib/worker-auth.server";

// Optional scheduler entry point. A dedicated server secret protects privileged
// queue execution; public Supabase credentials must never authorize this endpoint.
export const Route = createFileRoute("/api/public/hooks/scan-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!matchesWorkerSecret(token, process.env["SCAN_WORKER_SECRET"])) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { runWorker } = await import("@/lib/queue.server");
        const result = await runWorker({ deadlineMs: 45_000 });
        return Response.json(result);
      },
    },
  },
});
