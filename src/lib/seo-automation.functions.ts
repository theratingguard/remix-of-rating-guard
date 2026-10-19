import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getSeoAutomationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if ((await context.supabase.rpc("report_access_level").throwOnError()).data !== "super_admin")
      throw new Error("Access Denied: SEO automation is Super Admin only.");
    const { readSeoWorkerHealth } = await import("./seo-automation.server");
    return readSeoWorkerHealth();
  });

export const triggerSeoAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if ((await context.supabase.rpc("report_access_level").throwOnError()).data !== "super_admin")
      throw new Error("Access Denied: SEO automation is Super Admin only.");
    const { queueManualSeoRun } = await import("./seo-automation.server");
    await queueManualSeoRun();
    return { queued: true };
  });

export const searchOpenStreetMapLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      radiusMeters: z.number().int().min(500).max(10_000),
      category: z.enum([
        "all",
        "dentists",
        "doctors",
        "hotels",
        "lawyers",
        "real_estate",
        "home_services",
        "restaurants",
        "retail",
      ]),
    }),
  )
  .handler(async ({ context, data }) => {
    if ((await context.supabase.rpc("report_access_level").throwOnError()).data !== "super_admin")
      throw new Error("Access Denied: lead search is Super Admin only.");
    const { searchAndSaveOsmLeads } = await import("./seo-automation.server");
    return searchAndSaveOsmLeads({ ...data, actorId: context.userId });
  });

export const updateSeoProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      table: z.enum(["seo_content_drafts", "seo_meta_suggestions", "seo_link_suggestions"]),
      id: z.string().uuid(),
      status: z.enum(["approved", "rejected"]),
    }),
  )
  .handler(async ({ context, data }) => {
    if ((await context.supabase.rpc("report_access_level").throwOnError()).data !== "super_admin")
      throw new Error("Access Denied: SEO proposal approval is Super Admin only.");
    const update = {
      status: data.status,
      approved_by: data.status === "approved" ? context.userId : null,
      approved_at: data.status === "approved" ? new Date().toISOString() : null,
    };
    const result =
      data.table === "seo_content_drafts"
        ? await context.supabase
            .from("seo_content_drafts")
            .update(update)
            .eq("id", data.id)
            .eq("status", "pending")
            .select("id")
            .maybeSingle()
        : data.table === "seo_meta_suggestions"
          ? await context.supabase
              .from("seo_meta_suggestions")
              .update(update)
              .eq("id", data.id)
              .eq("status", "pending")
              .select("id")
              .maybeSingle()
          : await context.supabase
              .from("seo_link_suggestions")
              .update(update)
              .eq("id", data.id)
              .eq("status", "pending")
              .select("id")
              .maybeSingle();
    if (result.error) throw result.error;
    return { updated: result.data !== null };
  });
