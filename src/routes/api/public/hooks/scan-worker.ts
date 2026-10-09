import { createFileRoute } from "@tanstack/react-router";

// Called every minute by the database scheduler, only while links are waiting.
// The bearer check filters stray traffic; the worker itself is safe to call repeatedly:
// it only processes jobs signed-in users already queued, holds a single-run lock,
// processes a small bounded batch and honours the paused state.
export const Route = createFileRoute("/api/public/hooks/scan-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        const allowed = [process.env["SUPABASE_PUBLISHABLE_KEY"], process.env["SUPABASE_ANON_KEY"], process.env["LOVABLE_CRON_SECRET"]].filter(Boolean);
        if (!token || !allowed.includes(token)) return new Response("Unauthorized", { status: 401 });
        const { runWorker } = await import("@/lib/queue.server");
        const result = await runWorker({ deadlineMs: 45_000 });
        return Response.json(result);
      },
    },
  },
});
