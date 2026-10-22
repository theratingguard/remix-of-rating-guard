import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createSelectedReport } from "./review-selection.server";

export const generateSelectedReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
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
      const result = await createSelectedReport(
        context.supabase,
        context.userId,
        data.scanId,
        data.reviewIds,
      );
      const artifactId = z
        .string()
        .uuid()
        .parse(
          new URL(result.url).pathname
            .split("/")
            .pop()
            ?.replace(/_selected\.pdf$/, ""),
        );
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .rpc("register_private_selected_artifact", {
          _artifact_id: artifactId,
          _scan_id: data.scanId,
          _owner_id: context.userId,
        })
        .throwOnError();
      return result;
    } catch (error) {
      console.error("[review-selection] Selected report failed", error);
      throw error;
    }
  });
