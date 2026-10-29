import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const assignHierarchyTaskSchema = z.object({
  assigneeId: z.string().uuid(),
  reviewUrl: z.string().trim().min(1).max(2048),
  title: z.string().trim().min(1).max(160),
  description: z.string().max(5000).default(""),
});

export const getHierarchyDashboardData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [reportsResult, summaryResult, profileResult] = await Promise.all([
      context.supabase.rpc("hierarchy_direct_reports"),
      context.supabase.rpc("hierarchy_task_summary"),
      context.supabase.from("staff").select("name,credits").eq("id", context.userId).maybeSingle(),
    ]);

    if (reportsResult.error)
      throw new Error(`Could not load direct reports: ${reportsResult.error.message}`);
    if (summaryResult.error)
      throw new Error(`Could not load hierarchy task summary: ${summaryResult.error.message}`);
    if (profileResult.error)
      throw new Error(`Could not load your profile summary: ${profileResult.error.message}`);
    if (!profileResult.data) throw new Error("Active hierarchy profile not found.");

    return {
      reports: reportsResult.data ?? [],
      summary: summaryResult.data?.[0] ?? {
        total_tasks: 0,
        pending_tasks: 0,
        in_progress_tasks: 0,
        completed_tasks: 0,
        rejected_tasks: 0,
      },
      profile: profileResult.data,
    };
  });

export const assignHierarchyTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => assignHierarchyTaskSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: taskId, error } = await context.supabase.rpc(
      "create_hierarchy_review_task",
      {
        _assignee_id: data.assigneeId,
        _review_url: data.reviewUrl,
        _title: data.title,
        _description: data.description,
      },
    );
    if (error) throw new Error(`Could not assign review task: ${error.message}`);
    if (!taskId) throw new Error("Task assignment returned no task ID.");
    return { taskId };
  });
