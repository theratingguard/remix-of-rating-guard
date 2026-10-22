import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { prepareRecordedRejectionAppeal } from "./appeal-automation.server";

export const generateAppealDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ outcomeId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    try {
      return await prepareRecordedRejectionAppeal(context.supabase, data.outcomeId);
    } catch (error) {
      console.error(
        "[appeal] Draft generation denied or failed",
        error instanceof Error ? error.message : "Unknown error",
      );
      throw error;
    }
  });
