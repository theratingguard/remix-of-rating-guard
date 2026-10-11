import { createServerFn } from "@tanstack/react-start";
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
  .inputValidator((input) => memoryReviewSchema.parse(input))
  .handler(async ({ context, data }) => {
    if ((await context.supabase.rpc("report_access_level").throwOnError()).data !== "super_admin")
      throw new Error("Access Denied: case prediction is Super Admin only.");
    const { predictOutcome } = await import("./prediction.server");
    return predictOutcome(context.supabase, data);
  });
