import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDraftContent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (role.error) throw new Error("Could not verify content editor permissions.");
    if (!role.data) throw new Error("Only an administrator can preview unpublished content.");
    const result = await context.supabase
      .from("site_content")
      .select("draft,published,published_at")
      .eq("id", "home")
      .single();
    if (result.error) throw new Error("Could not load homepage draft.");
    return result.data;
  });
