import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { privatePdfInput, readPrivateReportPdf } from "./private-report.server";

export const downloadPrivateReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => privatePdfInput.parse(input))
  .handler(async ({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    setResponseHeader("X-Content-Type-Options", "nosniff");
    try {
      return await readPrivateReportPdf(context.supabase, data, context.userId);
    } catch (error) {
      console.error("[private-report] Download denied or failed", error);
      throw error;
    }
  });
