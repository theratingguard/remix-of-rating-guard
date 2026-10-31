import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateInternalChatReply } from "@/lib/internal-chat-ai.server";
import { translateChatText } from "@/lib/chat-translation.server";
import { isLanguageCode, type LanguageCode } from "@/lib/languages";

const messageInput = z.object({ messageId: z.string().uuid() });
const sendMessageInput = z.object({
  message: z.string().trim().min(1).max(4000),
  receiverId: z.string().uuid().optional(),
});
const editMessageInput = z.object({
  messageId: z.string().uuid(),
  message: z.string().trim().min(1).max(4000),
});

async function profileLanguage(
  supabaseAdmin: (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"],
  userId: string,
): Promise<LanguageCode> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("language")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Could not load a chat participant's language preference.");
  const language = data?.language ?? "en";
  if (!isLanguageCode(language))
    throw new Error("A chat participant has an unsupported language preference.");
  return language;
}

async function prepareTranslatedMessage(
  message: string,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
) {
  const englishMessage =
    sourceLanguage === "en"
      ? message
      : await translateChatText(message, sourceLanguage, "en");
  const translatedMessage =
    targetLanguage === sourceLanguage
      ? message
      : targetLanguage === "en"
      ? englishMessage
      : await translateChatText(englishMessage, "en", targetLanguage);
  return { englishMessage, translatedMessage };
}

function appRoleFromClaims(claims: Record<string, unknown>): string | null {
  const metadata = claims["app_metadata"];
  if (!metadata || typeof metadata !== "object" || !("role" in metadata)) return null;
  const role = metadata.role;
  return typeof role === "string" ? role : null;
}

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

export const sendInternalChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => sendMessageInput.parse(input))
  .handler(async ({ context, data }) => {
    const { data: access, error: accessError } = await context.supabase.rpc("report_access_level");
    if (accessError) throw new Error("Could not verify chat access.");

    let receiverId: string;
    let senderRole: "staff" | "client" | "reseller" | "superadmin";
    if (access === "super_admin") {
      if (!data.receiverId) throw new Error("Choose a chat recipient.");
      const { data: contacts, error: contactsError } =
        await context.supabase.rpc("internal_chat_contacts");
      if (contactsError) throw new Error("Could not verify the chat recipient.");
      if (!(contacts ?? []).some((contact) => contact.user_id === data.receiverId))
        throw new Error("This user is not an eligible chat recipient.");
      receiverId = data.receiverId;
      senderRole = "superadmin";
    } else {
      if (data.receiverId) throw new Error("Only Superadmin can choose a chat recipient.");
      const { data: superAdminId, error: superAdminError } = await context.supabase.rpc(
        "internal_chat_super_admin_id",
      );
      if (superAdminError || !superAdminId) throw new Error("Chat is not configured yet.");
      receiverId = superAdminId;

      const appRole = appRoleFromClaims(context.claims);
      if (appRole === "client" || appRole === "reseller") {
        senderRole = appRole;
      } else {
        const { data: staff, error: staffError } = await context.supabase
          .from("staff")
          .select("id")
          .eq("id", context.userId)
          .maybeSingle();
        if (staffError) throw new Error("Could not verify your chat role.");
        if (!staff) throw new Error("Your account is not eligible to send chat messages.");
        senderRole = "staff";
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [sourceLanguage, targetLanguage] = await Promise.all([
      profileLanguage(supabaseAdmin, context.userId),
      profileLanguage(supabaseAdmin, receiverId),
    ]);
    const { englishMessage, translatedMessage } = await prepareTranslatedMessage(
      data.message,
      sourceLanguage,
      targetLanguage,
    );
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("internal_messages")
      .insert({
        sender_id: context.userId,
        sender_role: senderRole,
        receiver_id: receiverId,
        message: englishMessage,
        original_message: data.message,
        translated_message: translatedMessage,
        original_language: sourceLanguage,
        translated_language: targetLanguage,
      })
      .select("id")
      .single();
    if (insertError) throw new Error("The translated chat message could not be saved.");
    return { messageId: inserted.id };
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
    const targetLanguage = await profileLanguage(supabaseAdmin, context.userId);
    const translatedReply =
      targetLanguage === "en" ? reply : await translateChatText(reply, "en", targetLanguage);

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("internal_messages")
      .upsert(
        {
          sender_id: superAdminId,
          sender_role: "ai",
          receiver_id: context.userId,
          message: reply,
          original_message: reply,
          translated_message: translatedReply,
          original_language: "en",
          translated_language: targetLanguage,
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

    const { data: currentMessage, error: currentMessageError } = await context.supabase
      .from("internal_messages")
      .select("id,sender_id,receiver_id")
      .eq("id", data.messageId)
      .maybeSingle();
    if (currentMessageError || !currentMessage) throw new Error("The message could not be loaded.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [sourceLanguage, targetLanguage] = await Promise.all([
      profileLanguage(supabaseAdmin, context.userId),
      profileLanguage(supabaseAdmin, currentMessage.receiver_id),
    ]);
    const { englishMessage, translatedMessage } = await prepareTranslatedMessage(
      data.message,
      sourceLanguage,
      targetLanguage,
    );

    const { error } = await context.supabase.rpc("admin_edit_internal_message", {
      _message_id: data.messageId,
      _replacement: data.message,
    });
    if (error) throw new Error("The message could not be edited and audited.");
    const { error: translationError } = await supabaseAdmin
      .from("internal_messages")
      .update({
        message: englishMessage,
        original_message: data.message,
        translated_message: translatedMessage,
        original_language: sourceLanguage,
        translated_language: targetLanguage,
      })
      .eq("id", data.messageId);
    if (translationError)
      throw new Error("The message was audited, but its translation could not be saved.");
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
