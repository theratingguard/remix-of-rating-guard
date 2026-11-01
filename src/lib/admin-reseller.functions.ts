import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const resellerStatusSchema = z.object({
  resellerId: z.string().uuid(),
  decision: z.enum(["approved", "suspended"]),
});

export const setAdminResellerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => resellerStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: accessLevel, error: accessError } =
      await context.supabase.rpc("report_access_level");
    if (accessError)
      throw new Error(`Could not verify Super Admin access: ${accessError.message}`);
    if (accessLevel !== "super_admin") throw new Error("Super Admin access required.");

    const { data: profile, error: profileError } = await context.supabase
      .from("reseller_profiles")
      .select("status")
      .eq("user_id", data.resellerId)
      .maybeSingle();
    if (profileError)
      throw new Error(`Could not verify the reseller account: ${profileError.message}`);
    if (!profile) throw new Error("Reseller profile not found.");

    const shouldChangeBan =
      data.decision === "suspended" || profile.status === "suspended";
    const banDuration = data.decision === "suspended" ? "876000h" : "none";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let authBanChanged = false;

    if (shouldChangeBan) {
      const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(
        data.resellerId,
        { ban_duration: banDuration },
      );
      if (banError) throw new Error(`Could not update reseller login access: ${banError.message}`);
      authBanChanged = true;
    }

    const { error: statusError } = await context.supabase.rpc("admin_review_reseller", {
      _reseller_id: data.resellerId,
      _decision: data.decision,
    });
    if (statusError) {
      if (authBanChanged) {
        const rollbackDuration = profile.status === "suspended" ? "876000h" : "none";
        const { error: rollbackError } = await supabaseAdmin.auth.admin.updateUserById(
          data.resellerId,
          { ban_duration: rollbackDuration },
        );
        if (rollbackError) {
          throw new Error(
            `Could not update reseller status: ${statusError.message}. Login-access rollback failed: ${rollbackError.message}`,
          );
        }
      }
      throw new Error(`Could not update reseller status: ${statusError.message}`);
    }

    return data.decision;
  });
