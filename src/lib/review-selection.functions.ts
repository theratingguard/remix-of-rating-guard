import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createSelectedReport } from "./review-selection.server";

export const generateSelectedReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        scanId: z.string().uuid(),
        reviewIds: z
          .array(z.string().uuid())
          .min(1)
          .max(5)
          .refine((ids) => new Set(ids).size === ids.length, "Duplicate selected review IDs."),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      return await createSelectedReport(
        context.supabase,
        context.userId,
        data.scanId,
        data.reviewIds,
      );
    } catch (error) {
      console.error("[review-selection] Selected report failed", error);
      throw error;
    }
  });
