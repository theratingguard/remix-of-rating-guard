import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateOwnedReportPdf } from "./report-pdf.server";

export const saveReportPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        scanId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      return await generateOwnedReportPdf(context.supabase, context.userId, data.scanId);
    } catch (error) {
      console.error("[report-pdf] VPS export failed", error);
      throw error;
    }
  });
