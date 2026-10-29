import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { memoryReviewSchema } from "./memory";

export const getMemoryStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if ((await context.supabase.rpc("report_access_level").throwOnError()).data !== "super_admin")
      throw new Error("Access Denied: memory diagnostics are Super Admin only.");
    const { memoryStats } = await import("./memory.server");
    return memoryStats(context.supabase);
  });

export const predictCaseOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => memoryReviewSchema.parse(input))
  .handler(async ({ context, data }) => {
    if ((await context.supabase.rpc("report_access_level").throwOnError()).data !== "super_admin")
      throw new Error("Access Denied: case prediction is Super Admin only.");
    const { predictOutcome } = await import("./prediction.server");
    return predictOutcome(context.supabase, data);
  });

export const clearPendingCaseMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ confirmation: z.literal("CLEAR_PENDING_CASE_MEMORY") }).parse(input),
  )
  .handler(async ({ context }) => {
    if ((await context.supabase.rpc("report_access_level").throwOnError()).data !== "super_admin")
      throw new Error("Access Denied: clearing case memory is Super Admin only.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("case_memory")
      .delete()
      .eq("outcome", "pending")
      .select("id");
    if (error) throw new Error(`Could not clear pending case memory: ${error.message}`);
    return { cleared: data?.length ?? 0 };
  });
