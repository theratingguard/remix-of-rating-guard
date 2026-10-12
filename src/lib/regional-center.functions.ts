import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRegionalStrategy, REGIONS } from "./regional-routing";

const regionStatsSchema = z.array(
  z.object({
    region: z.enum(REGIONS),
    jurisdiction: z.string(),
    scans: z.number().int().nonnegative(),
    submissions: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    approved: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
    success_rate: z.number().min(0).max(100).nullable(),
  }),
);

export const getRegionalRemovalSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await context.supabase.rpc("report_access_level").throwOnError();
    if (access.data !== "super_admin") throw new Error("Access Denied.");
    const result = await context.supabase.rpc("regional_removal_stats").throwOnError();
    const regions = regionStatsSchema.parse(result.data);
    return {
      regions,
      strategies: REGIONS.map((region) => getRegionalStrategy(region)),
      note: "Rates use manually recorded, resolved outcomes only. Pending and unrecorded Google decisions are not counted as success or failure.",
    };
  });
