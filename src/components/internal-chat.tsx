import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  Pencil,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  editInternalChatMessage,
  getInternalChatContacts,
  removeInternalChatMessage,
  requestInternalChatAutoReply,
} from "@/lib/internal-chat.functions";
import { Avatar } from "@/components/app-shell";
import { Switch } from "@/components/ui/switch";

type ChatMessage = Tables<"internal_messages">;
type MessageAudit = Tables<"internal_message_audit">;
type Contact = {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  last_seen_at: string | null;
};

export function InternalChat({
  userId,
  email,
  role,
  isSuperAdmin,
}: {
  userId: string;
  email: string;
  role: "staff" | "client" | "reseller" | "superadmin";
  isSuperAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const getContacts = useServerFn(getInternalChatContacts);
  const editMessage = useServerFn(editInternalChatMessage);
  const removeMessage = useServerFn(removeInternalChatMessage);
  const requestAiReply = useServerFn(requestInternalChatAutoReply);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [superAdminId, setSuperAdminId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [savingAi, setSavingAi] = useState(false);

  const contactsQuery = useQuery({
    queryKey: ["internal-chat", "contacts"],
    queryFn: () => getContacts(),
    enabled: isSuperAdmin,
    refetchInterval: 15_000,
  });
  const contacts = useMemo(() => (contactsQuery.data ?? []) as Contact[], [contactsQuery.data]);
  const activeContact = contacts.find((contact) => contact.user_id === selectedId) ?? null;
  const conversationUserId = isSuperAdmin ? selectedId : userId;
  const unreadQuery = useQuery({
    queryKey: ["internal-chat", "unread", userId],
    refetchInterval: 5_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internal_messages")
        .select("sender_id")
        .eq("receiver_id", userId)
        .eq("is_read", false)
        .limit(1000);
      if (error) throw error;
      return data;
    },
  });
  const messagesQuery = useQuery({
    queryKey: ["internal-chat", "messages", userId, conversationUserId],
    enabled: Boolean(conversationUserId && (isSuperAdmin ? superAdminId : true)),
    refetchInterval: 3_000,
    queryFn: async () => {
      let query = supabase
        .from("internal_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(150);
      if (isSuperAdmin && conversationUserId) {
        query = query.or(`sender_id.eq.${conversationUserId},receiver_id.eq.${conversationUserId}`);
      } else {
        query = query.or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data.reverse() as ChatMessage[];
    },
  });

  useEffect(() => {
    let mounted = true;
    if (role === "reseller") {
      void supabase.rpc("ensure_reseller_profile").then(({ error }) => {
        if (error) toast.error("Could not prepare the reseller chat profile.");
      });
    }
    void supabase.rpc("internal_chat_super_admin_id").then(({ data, error }) => {
      if (error) {
        toast.error("Could not connect to the support chat.");
        return;
      }
      if (mounted) setSuperAdminId(data);
    });
    const sendPresence = () =>
      supabase
        .from("internal_chat_presence")
        .upsert(
          { user_id: userId, last_seen_at: new Date().toISOString() },
          { onConflict: "user_id" },
        )
        .then(({ error }) => {
          if (error) console.error("Could not update chat presence:", error.message);
        });
    void sendPresence();
    const timer = window.setInterval(() => void sendPresence(), 30_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [role, userId]);

  useEffect(() => {
    if (isSuperAdmin && !selectedId && contacts.length > 0) setSelectedId(contacts[0]!.user_id);
  }, [contacts, isSuperAdmin, selectedId]);

  useEffect(() => {
    if (isSuperAdmin) {
      void supabase
        .from("internal_chat_settings")
        .select("ai_auto_reply")
        .eq("id", 1)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) toast.error("Could not load the AI reply setting.");
          else if (data) setAiEnabled(data.ai_auto_reply);
        });
    }
  }, [isSuperAdmin]);

  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const auditQuery = useQuery({
    queryKey: ["internal-chat", "audit", messages.map((message) => message.id).join(",")],
    enabled: isSuperAdmin && messages.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internal_message_audit")
        .select("*")
        .in(
          "message_id",
          messages.map((message) => message.id),
        )
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as MessageAudit[];
    },
  });
  const auditByMessage = useMemo(() => {
    const grouped = new Map<string, MessageAudit[]>();
    for (const record of auditQuery.data ?? []) {
      const records = grouped.get(record.message_id) ?? [];
      records.push(record);
      grouped.set(record.message_id, records);
    }
    return grouped;
  }, [auditQuery.data]);
  const unreadByContact = useMemo(() => {
    const counts = new Map<string, number>();
    for (const message of unreadQuery.data ?? []) {
      counts.set(message.sender_id, (counts.get(message.sender_id) ?? 0) + 1);
    }
    return counts;
  }, [unreadQuery.data]);

  useEffect(() => {
    const unread = messages.filter((message) => !message.is_read && message.receiver_id === userId);
    if (!unread.length) return;
    void supabase
      .from("internal_messages")
      .update({ is_read: true })
      .in(
        "id",
        unread.map((message) => message.id),
      )
      .then(({ error }) => {
        if (error) toast.error("Could not mark messages as read.");
        else void queryClient.invalidateQueries({ queryKey: ["internal-chat"] });
      });
  }, [messages, queryClient, userId]);

  async function toggleAi(enabled: boolean) {
    setSavingAi(true);
    try {
      const { error } = await supabase
        .from("internal_chat_settings")
        .update({ ai_auto_reply: enabled, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) toast.error("Could not update the AI auto-reply setting.");
      else {
        setAiEnabled(enabled);
        toast.success(`AI auto-reply ${enabled ? "enabled" : "disabled"}.`);
      }
    } catch {
      toast.error("Could not update the AI auto-reply setting.");
    } finally {
      setSavingAi(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;
    const receiverId = isSuperAdmin ? selectedId : superAdminId;
    if (!receiverId) {
      toast.error("Support chat is not available right now.");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase
        .from("internal_messages")
        .insert({
          sender_id: userId,
          sender_role: role,
          receiver_id: receiverId,
          message,
        })
        .select("id")
        .single();
      if (error) {
        toast.error("Your message could not be sent. Please try again.");
        return;
      }
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["internal-chat"] });
      if (!isSuperAdmin) {
        try {
          const result = await requestAiReply({ data: { messageId: data.id } });
          if (result.generated) {
            await queryClient.invalidateQueries({ queryKey: ["internal-chat"] });
          }
        } catch {
          toast.error("Message sent. The AI assistant could not reply right now.");
        }
      }
    } catch {
      toast.error("Your message could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section
      onCopy={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      className="mx-auto flex h-[calc(100svh-8rem)] min-h-[520px] max-w-7xl select-none overflow-hidden rounded-2xl border bg-card shadow-sm [-webkit-user-drag:none]"
    >
      {isSuperAdmin && (
        <aside className="flex w-72 shrink-0 flex-col border-r sm:w-80">
          <div className="border-b p-4">
            <h1 className="font-display text-lg font-bold">Chats</h1>
            <p className="text-xs text-muted-foreground">
              Private conversations with account holders
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {contactsQuery.isPending && (
              <div className="flex justify-center p-6">
                <LoaderCircle className="size-5 animate-spin" />
              </div>
            )}
            {contactsQuery.error && (
              <p role="alert" className="p-4 text-sm text-destructive">
                Could not load the conversation list.
              </p>
            )}
            {contacts.map((contact) => (
              <button
                key={contact.user_id}
                type="button"
                onClick={() => setSelectedId(contact.user_id)}
                className={`flex w-full items-center gap-3 border-b px-4 py-3 text-left hover:bg-muted/60 ${selectedId === contact.user_id ? "bg-muted" : ""}`}
              >
                <Avatar name={contact.display_name} url={null} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {contact.display_name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {contact.role} · {contact.email}
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span
                      className={`size-1.5 rounded-full ${contact.last_seen_at && Date.now() - Date.parse(contact.last_seen_at) < 120_000 ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
                    />
                    {contact.last_seen_at && Date.now() - Date.parse(contact.last_seen_at) < 120_000
                      ? "Online"
                      : "Offline"}
                  </span>
                </span>
                {(unreadByContact.get(contact.user_id) ?? 0) > 0 && (
                  <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {unreadByContact.get(contact.user_id)}
                  </span>
                )}
              </button>
            ))}
            {!contactsQuery.isPending && !contactsQuery.error && contacts.length === 0 && (
              <p className="p-5 text-sm text-muted-foreground">No eligible users yet.</p>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t p-4">
            <span className="flex items-center gap-2 text-xs font-medium">
              <Sparkles className="size-4 text-primary" /> AI auto-reply
            </span>
            <Switch
              checked={aiEnabled}
              onCheckedChange={(checked) => void toggleAi(checked)}
              disabled={savingAi}
              aria-label="AI auto-reply"
            />
          </div>
          <p className="px-4 pb-3 text-[11px] leading-relaxed text-muted-foreground">
            AI replies are identified as AI. Ollama must be available on the server.
          </p>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col bg-[linear-gradient(135deg,hsl(var(--muted)/.35),transparent)]">
        <header className="flex min-h-16 items-center gap-3 border-b bg-card px-4 py-3">
          {isSuperAdmin && activeContact ? (
            <>
              <Avatar name={activeContact.display_name} url={null} size={38} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{activeContact.display_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {activeContact.role} · {activeContact.email}
                </p>
              </div>
            </>
          ) : (
            <>
              <span className="grid size-10 place-items-center rounded-full bg-emerald-600 text-white">
                <ShieldCheck className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">Rating Guard Support</p>
                <p className="text-xs text-muted-foreground">Private chat with Superadmin</p>
              </div>
            </>
          )}
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 sm:p-6">
          {messagesQuery.isPending && (
            <div className="grid flex-1 place-items-center">
              <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {messagesQuery.error && (
            <p role="alert" className="m-auto text-sm text-destructive">
              Messages could not be loaded. Refresh to retry.
            </p>
          )}
          {!messagesQuery.isPending && !messagesQuery.error && messages.length === 0 && (
            <div className="m-auto max-w-sm text-center">
              <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                <MessageCircle className="size-6" />
              </span>
              <p className="font-semibold">Start a private conversation</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Only you and the Superadmin can see messages in this chat.
              </p>
            </div>
          )}
          {messages.map((message) => {
            const mine = message.sender_id === userId;
            const removed = message.deleted_by_superadmin;
            return (
              <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <article
                  onContextMenu={(event) => event.preventDefault()}
                  className={`max-w-[88%] select-none rounded-2xl px-3.5 py-2.5 shadow-sm [-webkit-user-drag:none] sm:max-w-[72%] ${mine ? "rounded-br-md bg-emerald-700 text-white" : "rounded-bl-md border bg-white text-slate-900"}`}
                >
                  <div className="mb-1 flex items-center justify-between gap-4">
                    {message.sender_role === "ai" ? (
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                        <Sparkles className="size-3" /> AI support assistant
                      </p>
                    ) : isSuperAdmin && !mine ? (
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {message.sender_role}
                      </p>
                    ) : (
                      <span />
                    )}
                    <LockKeyhole
                      aria-label="Locked evidence message"
                      className={`size-3 shrink-0 ${mine ? "text-emerald-100" : "text-slate-400"}`}
                    />
                  </div>
                  {removed ? (
                    <p className="text-sm italic text-slate-500">
                      Removed from user view; original retained in the evidence audit.
                    </p>
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {message.message}
                    </p>
                  )}
                  <div
                    className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${mine ? "text-emerald-100" : "text-slate-500"}`}
                  >
                    <time
                      dateTime={message.created_at}
                      title={`UTC ${new Date(message.created_at).toISOString()}`}
                    >
                      {new Date(message.created_at).toLocaleString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </time>
                    {mine && (
                      <Check className={`size-3 ${message.is_read ? "text-sky-200" : ""}`} />
                    )}
                  </div>
                  <p
                    className={`mt-1 font-mono text-[9px] opacity-60 ${mine ? "text-right text-emerald-100" : "text-slate-500"}`}
                    title={`Sender user ID: ${message.sender_id}`}
                  >
                    ID {message.sender_id}
                  </p>
                  {isSuperAdmin && !removed && (
                    <div className="mt-2 flex justify-end gap-1 border-t border-current/15 pt-1.5">
                      <button
                        type="button"
                        aria-label="Edit and audit message"
                        className="rounded p-1 opacity-75 hover:bg-black/10 hover:opacity-100"
                        onClick={() => {
                          const replacement = window.prompt(
                            "Replace this message? The original will remain in the evidence audit.",
                            message.message,
                          );
                          if (replacement === null || !replacement.trim()) return;
                          void editMessage({
                            data: { messageId: message.id, message: replacement },
                          })
                            .then(() => {
                              toast.success(
                                "Message updated; the original is preserved in the audit.",
                              );
                              return queryClient.invalidateQueries({
                                queryKey: ["internal-chat"],
                              });
                            })
                            .catch(() => toast.error("Message could not be edited and audited."));
                        }}
                      >
                        <Pencil className="size-3" />
                      </button>
                      <button
                        type="button"
                        aria-label="Remove message from user view"
                        className="rounded p-1 text-destructive opacity-75 hover:bg-black/10 hover:opacity-100"
                        onClick={() => {
                          if (
                            !window.confirm(
                              "Remove this message from the user's view? The original remains permanently in the evidence audit.",
                            )
                          )
                            return;
                          void removeMessage({ data: { messageId: message.id } })
                            .then(() => {
                              toast.success(
                                "Message hidden from user view and preserved in the audit.",
                              );
                              return queryClient.invalidateQueries({
                                queryKey: ["internal-chat"],
                              });
                            })
                            .catch(() => toast.error("Message could not be removed and audited."));
                        }}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  )}
                  {(auditByMessage.get(message.id) ?? []).map((record) => (
                    <div
                      key={record.id}
                      className="mt-2 border-t border-current/15 pt-2 text-[10px] text-muted-foreground"
                    >
                      <p className="font-semibold uppercase">
                        Superadmin {record.action} · {new Date(record.created_at).toISOString()}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words">
                        Before: {record.previous_message}
                      </p>
                      {record.replacement_message && (
                        <p className="mt-1 whitespace-pre-wrap break-words">
                          After: {record.replacement_message}
                        </p>
                      )}
                      <p className="mt-1 font-mono">Actor {record.actor_id}</p>
                    </div>
                  ))}
                </article>
              </div>
            );
          })}
        </div>

        <form
          onSubmit={(event) => void sendMessage(event)}
          className="flex items-end gap-2 border-t bg-card p-3 sm:p-4"
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            maxLength={4000}
            rows={1}
            aria-label="Message"
            placeholder="Write a message…"
            className="max-h-32 min-h-11 flex-1 resize-y rounded-xl border bg-background px-3 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            disabled={
              sending ||
              !draft.trim() ||
              (!isSuperAdmin && !superAdminId) ||
              (isSuperAdmin && !selectedId)
            }
            aria-label="Send message"
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-700 text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </button>
        </form>
        {isSuperAdmin && (
          <p className="px-4 pb-2 text-center text-[10px] text-muted-foreground">
            Signed in as {email}
          </p>
        )}
      </div>
    </section>
  );
}
