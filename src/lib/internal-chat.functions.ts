import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateInternalChatReply } from "@/lib/internal-chat-ai.server";

const messageInput = z.object({ messageId: z.string().uuid() });
const editMessageInput = z.object({
  messageId: z.string().uuid(),
  message: z.string().trim().min(1).max(4000),
});

export const getInternalChatContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: access, error: accessError } = await context.supabase.rpc("report_access_level");
    if (accessError) throw new Error("Could not verify chat access.");
    if (access !== "super_admin") throw new Error("Superadmin access is required.");

    const { data, error } = await context.supabase.rpc("internal_chat_contacts");
    if (error) throw new Error("Could not load the chat list.");
    return data;
  });

export const requestInternalChatAutoReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => messageInput.parse(input))
  .handler(async ({ context, data }) => {
    const { data: superAdminId, error: superAdminError } = await context.supabase.rpc(
      "internal_chat_super_admin_id",
    );
    if (superAdminError || !superAdminId) throw new Error("Chat is not configured yet.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: incoming, error: incomingError } = await context.supabase
      .from("internal_messages")
      .select("id,sender_id,sender_role,receiver_id,message")
      .eq("id", data.messageId)
      .eq("sender_id", context.userId)
      .eq("receiver_id", superAdminId)
      .maybeSingle();
    if (incomingError || !incoming) throw new Error("This message is not available in your chat.");

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("internal_chat_settings")
      .select("ai_auto_reply")
      .eq("id", 1)
      .single();
    if (settingsError) throw new Error("Could not check the AI reply setting.");
    if (!settings.ai_auto_reply) return { generated: false as const };

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("internal_messages")
      .select("id")
      .eq("reply_to_id", incoming.id)
      .maybeSingle();
    if (existingError) throw new Error("Could not check for an existing AI reply.");
    if (existing) return { generated: true as const, messageId: existing.id };

    const reply = await generateInternalChatReply(incoming.message);

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("internal_messages")
      .upsert(
        {
          sender_id: superAdminId,
          sender_role: "ai",
          receiver_id: context.userId,
          message: reply,
          reply_to_id: incoming.id,
        },
        { onConflict: "reply_to_id", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();
    if (insertError) throw new Error("The AI response could not be saved.");
    if (inserted) return { generated: true as const, messageId: inserted.id };

    const { data: concurrentReply, error: concurrentError } = await supabaseAdmin
      .from("internal_messages")
      .select("id")
      .eq("reply_to_id", incoming.id)
      .single();
    if (concurrentError) throw new Error("Could not confirm the AI response.");
    return { generated: true as const, messageId: concurrentReply.id };
  });

export const editInternalChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => editMessageInput.parse(input))
  .handler(async ({ context, data }) => {
    const { data: access, error: accessError } = await context.supabase.rpc("report_access_level");
    if (accessError) throw new Error("Could not verify message-edit access.");
    if (access !== "super_admin")
      throw new Error("Only the Superadmin can edit evidence messages.");

    const { error } = await context.supabase.rpc("admin_edit_internal_message", {
      _message_id: data.messageId,
      _replacement: data.message,
    });
    if (error) throw new Error("The message could not be edited and audited.");
    return { ok: true as const };
  });

export const removeInternalChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => messageInput.parse(input))
  .handler(async ({ context, data }) => {
    const { data: access, error: accessError } = await context.supabase.rpc("report_access_level");
    if (accessError) throw new Error("Could not verify message-removal access.");
    if (access !== "super_admin")
      throw new Error("Only the Superadmin can remove evidence messages from chat.");

    const { error } = await context.supabase.rpc("admin_remove_internal_message", {
      _message_id: data.messageId,
    });
    if (error) throw new Error("The message could not be removed and audited.");
    return { ok: true as const };
  });
