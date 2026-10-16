import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logEvent } from "./logger.server";

const payoutSchema = z
  .object({
    method: z.enum(["upi", "bank", "binance"]),
    upi_id: z.string().trim().max(200).optional(),
    bank_name: z.string().trim().max(120).optional(),
    bank_holder: z.string().trim().max(120).optional(),
    bank_account_last4: z
      .string()
      .regex(/^[0-9]{4}$/)
      .optional(),
    binance_pay_id: z.string().trim().max(120).optional(),
  })
  .superRefine((data, context) => {
    if (data.method === "upi" && !data.upi_id)
      context.addIssue({ code: "custom", path: ["upi_id"], message: "Enter your UPI ID." });
    if (
      data.method === "bank" &&
      (!data.bank_name || !data.bank_holder || !data.bank_account_last4)
    )
      context.addIssue({
        code: "custom",
        path: ["bank_name"],
        message: "Enter bank name, account holder, and the last four account digits.",
      });
    if (data.method === "binance" && !data.binance_pay_id)
      context.addIssue({
        code: "custom",
        path: ["binance_pay_id"],
        message: "Enter your Binance Pay ID.",
      });
  });

async function requireApprovedStaff(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Could not load staff profile: ${error.message}`);
  if (!data || !["approved", "active"].includes(data.status))
    throw new Error("Staff dashboard access requires superadmin approval.");
  return data;
}

export const getStaffDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const profile = await requireApprovedStaff(context.userId);
    const headers = getRequest().headers;
    const city = headers.get("x-vercel-ip-city") ?? headers.get("cf-ipcity");
    const region = headers.get("x-vercel-ip-country-region");
    const country = headers.get("x-vercel-ip-country") ?? headers.get("cf-ipcountry");
    const ipLocation = [city, region, country]
      .filter((part): part is string => Boolean(part?.trim()))
      .map((part) => {
        try {
          return decodeURIComponent(part.replaceAll("+", " "));
        } catch {
          return part;
        }
      })
      .join(", ");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [casesResult, payoutResult, messagesResult, creditsResult, ledgerResult, notesResult] =
      await Promise.all([
        supabaseAdmin
          .from("staff_cases")
          .select("*")
          .eq("staff_id", context.userId)
          .order("assigned_at", { ascending: false })
          .limit(500),
        supabaseAdmin
          .from("staff_payout_details")
          .select("*")
          .eq("staff_id", context.userId)
          .maybeSingle(),
        supabaseAdmin
          .from("staff_admin_messages")
          .select("*")
          .eq("staff_id", context.userId)
          .order("created_at", { ascending: true })
          .limit(200),
        supabaseAdmin
          .from("staff_credits")
          .select("id,amount,reason,created_at,case_id")
          .eq("staff_id", context.userId)
          .order("created_at", { ascending: false })
          .limit(200),
        supabaseAdmin
          .from("staff_wallet_ledger")
          .select("*")
          .eq("staff_id", context.userId)
          .order("created_at", { ascending: false })
          .limit(200),
        supabaseAdmin
          .from("staff_quality_notes")
          .select("*")
          .eq("staff_id", context.userId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
    if (casesResult.error)
      throw new Error(`Could not load assigned tasks: ${casesResult.error.message}`);
    if (payoutResult.error)
      throw new Error(`Could not load payout details: ${payoutResult.error.message}`);
    if (messagesResult.error)
      throw new Error(`Could not load Admin Chat: ${messagesResult.error.message}`);
    if (creditsResult.error)
      throw new Error(`Could not load wallet history: ${creditsResult.error.message}`);
    if (ledgerResult.error)
      throw new Error(`Could not load wallet adjustments: ${ledgerResult.error.message}`);
    if (notesResult.error)
      throw new Error(`Could not load quality notes: ${notesResult.error.message}`);
    return {
      profile,
      ipLocation,
      cases: casesResult.data ?? [],
      payout: payoutResult.data,
      messages: messagesResult.data ?? [],
      credits: creditsResult.data ?? [],
      walletLedger: ledgerResult.data ?? [],
      qualityNotes: notesResult.data ?? [],
    };
  });

export const updateStaffTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        caseId: z.string().uuid(),
        action: z.enum(["accept", "reject", "start", "submit"]),
        reason: z.string().trim().max(1000).optional(),
        confirmed: z.literal(true).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireApprovedStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: task, error: findError } = await supabaseAdmin
      .from("staff_cases")
      .select("id,status")
      .eq("id", data.caseId)
      .eq("staff_id", context.userId)
      .maybeSingle();
    if (findError) throw new Error(`Could not verify assigned task: ${findError.message}`);
    if (!task) throw new Error("This task is not assigned to your staff account.");

    const transitions = {
      accept: { from: ["open"], to: "accepted" },
      reject: { from: ["open", "accepted", "in_progress"], to: "rejected" },
      start: { from: ["accepted", "rework"], to: "in_progress" },
      submit: { from: ["in_progress"], to: "submitted" },
    } as const;
    const transition = transitions[data.action];
    if (!transition.from.some((status) => status === task.status))
      throw new Error(`Cannot ${data.action} a task in the "${task.status}" state.`);
    if (data.action === "reject" && !data.reason?.trim())
      throw new Error("Add a reason before rejecting a task.");
    if (data.action === "submit" && data.confirmed !== true)
      throw new Error("Confirm that you submitted the request through Google's official channel.");

    const now = new Date().toISOString();
    const update = {
      status: transition.to,
      updated_at: now,
      ...(data.action === "reject" ? { staff_decision_reason: data.reason!.trim() } : {}),
      ...(data.action === "submit" ? { submitted_at: now } : {}),
    };
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("staff_cases")
      .update(update)
      .eq("id", task.id)
      .eq("staff_id", context.userId)
      .eq("status", task.status)
      .select("id,status")
      .maybeSingle();
    if (updateError) throw new Error(`Could not update task status: ${updateError.message}`);
    if (!updated) throw new Error("This task changed in another session. Refresh and try again.");
    logEvent("info", "staff.task.status.updated", "Staff task status changed", {
      action: data.action,
      newStatus: updated.status,
    });
    return updated;
  });

export const saveStaffPayoutDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => payoutSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireApprovedStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: saved, error } = await supabaseAdmin
      .from("staff_payout_details")
      .upsert(
        {
          staff_id: context.userId,
          method: data.method,
          upi_id: data.method === "upi" ? (data.upi_id ?? null) : null,
          bank_name: data.method === "bank" ? (data.bank_name ?? null) : null,
          bank_holder: data.method === "bank" ? (data.bank_holder ?? null) : null,
          bank_account_last4: data.method === "bank" ? (data.bank_account_last4 ?? null) : null,
          binance_pay_id: data.method === "binance" ? (data.binance_pay_id ?? null) : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "staff_id" },
      )
      .select("*")
      .single();
    if (error) throw new Error(`Could not save payout details: ${error.message}`);
    logEvent("info", "staff.payout.updated", "Staff payout details updated", {
      method: data.method,
    });
    return saved;
  });

export const sendStaffAdminMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ message: z.string().trim().min(1).max(4000) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireApprovedStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: message, error } = await supabaseAdmin
      .from("staff_admin_messages")
      .insert({
        staff_id: context.userId,
        sender_id: context.userId,
        sender_role: "staff",
        message: data.message,
      })
      .select("*")
      .single();
    if (error) throw new Error(`Could not send Admin Chat message: ${error.message}`);
    logEvent("info", "staff.communication.sent", "Staff sent an Admin Chat message");
    return message;
  });

export const getAdminStaffMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ staffId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: accessLevel, error: accessError } =
      await context.supabase.rpc("report_access_level");
    if (accessError) throw new Error("Could not verify administrator access.");
    if (accessLevel !== "super_admin")
      throw new Error("Superadmin access is required to view staff messages.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: staff, error: staffError } = await supabaseAdmin
      .from("staff")
      .select("id")
      .eq("id", data.staffId)
      .maybeSingle();
    if (staffError) throw new Error(`Could not verify staff recipient: ${staffError.message}`);
    if (!staff) throw new Error("Staff profile not found.");

    const { data: messages, error } = await supabaseAdmin
      .from("staff_admin_messages")
      .select("*")
      .eq("staff_id", staff.id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(`Could not load Admin Chat: ${error.message}`);
    return messages ?? [];
  });

export const sendAdminStaffMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        staffId: z.string().uuid(),
        message: z.string().trim().min(1).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: accessLevel, error: accessError } =
      await context.supabase.rpc("report_access_level");
    if (accessError)
      throw new Error(`Could not verify administrator access: ${accessError.message}`);
    if (accessLevel !== "super_admin")
      throw new Error("Superadmin access is required to reply to staff.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: staff, error: staffError } = await supabaseAdmin
      .from("staff")
      .select("id")
      .eq("id", data.staffId)
      .maybeSingle();
    if (staffError) throw new Error(`Could not verify staff recipient: ${staffError.message}`);
    if (!staff) throw new Error("Staff profile not found.");

    const { data: message, error } = await supabaseAdmin
      .from("staff_admin_messages")
      .insert({
        staff_id: staff.id,
        sender_id: context.userId,
        sender_role: "admin",
        message: data.message,
      })
      .select("*")
      .single();
    if (error) throw new Error(`Could not send Admin Chat reply: ${error.message}`);
    logEvent("info", "admin.staff.communication.replied", "Admin replied to a staff message");
    return message;
  });
