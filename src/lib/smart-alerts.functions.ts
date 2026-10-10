import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { alertsSampleSchema, buildSmartAlerts, compareBusinesses } from "./smart-alerts";
import { getSettings, requireFeature } from "./settings.server";
import { smtpConfigured, sendTextEmail } from "./email.server";

export const getSmartAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if ((await context.supabase.rpc("report_access_level").throwOnError()).data !== "super_admin")
      throw new Error("Access Denied: Super Admin insights only.");
    const result = await context.supabase.rpc("smart_alerts_sample").throwOnError();
    const sample = alertsSampleSchema.parse(result.data);
    const businesses = [];
    for (let offset = 0; ; offset += 500) {
      const result = await context.supabase
        .from("businesses")
        .select("id,name,rating,total_reviews,updated_at,category")
        .eq("is_seed", false)
        .order("id")
        .range(offset, offset + 499)
        .throwOnError();
      businesses.push(...result.data);
      if (result.data.length < 500) break;
      if (businesses.length >= 50000)
        throw new Error("Too many businesses for comparison; add pagination.");
    }
    return {
      ...buildSmartAlerts(sample),
      since: sample.since,
      generatedAt: sample.generated_at,
      businesses,
      emailAvailable: (await getSettings()).email_share_enabled && smtpConfigured(),
    };
  });
export const compareCompetitors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ ownId: z.string().uuid(), competitorId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    if ((await context.supabase.rpc("report_access_level").throwOnError()).data !== "super_admin")
      throw new Error("Access Denied: Super Admin comparison only.");
    const result = await context.supabase
      .from("businesses")
      .select("id,name,rating,total_reviews,updated_at")
      .in("id", [data.ownId, data.competitorId])
      .eq("is_seed", false)
      .throwOnError();
    const own = result.data.find((row) => row.id === data.ownId),
      competitor = result.data.find((row) => row.id === data.competitorId);
    if (!own || !competitor)
      throw new Error("Both businesses must have real scans accessible to you.");
    return compareBusinesses(own, competitor);
  });
export const sendWeeklyInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if ((await context.supabase.rpc("report_access_level").throwOnError()).data !== "super_admin")
      throw new Error("Access Denied: Super Admin weekly insights only.");
    await requireFeature("email_share_enabled");
    const sample = alertsSampleSchema.parse(
      (await context.supabase.rpc("smart_alerts_sample").throwOnError()).data,
    );
    const insights = buildSmartAlerts(sample);
    return sendTextEmail(
      "theratingguard@gmail.com",
      "Rating Guard: last 7 days",
      `Latest fetched samples from businesses scanned since ${sample.since}: ${insights.sampleSize} reviews, ${insights.flagged} flagged policy concerns.\nDecisions recorded this week: ${insights.weekly.approvedThisWeek} approved, ${insights.weekly.rejectedThisWeek} rejected.\nRequests submitted this week: ${insights.weekly.pending} currently pending.\n${insights.trends.map((row) => `${row.policy}: ${row.count}/${insights.flagged} flagged reviews (${row.percent}%).`).join("\n")}\nNot a complete Google review timeline; outcomes entered by representatives, not automatically captured Google decisions.`,
    );
  });
