import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAdminStaffMessages, sendAdminStaffMessage } from "@/lib/staff-dashboard.functions";
import { reportAccessQuery } from "@/lib/report-access";

export function AdminStaffChat({ staffId, staffName }: { staffId: string; staffName: string }) {
  const access = useQuery(reportAccessQuery());
  const loadMessages = useServerFn(getAdminStaffMessages);
  const sendMessage = useServerFn(sendAdminStaffMessage);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const messages = useQuery({
    queryKey: ["admin-staff-chat", staffId],
    queryFn: () => loadMessages({ data: { staffId } }),
    enabled: access.data === "super_admin",
    refetchInterval: 10_000,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await sendMessage({ data: { staffId, message } });
      setMessage("");
      await queryClient.invalidateQueries({ queryKey: ["admin-staff-chat", staffId] });
      toast.success("Reply sent to staff.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send Admin Chat reply.");
    } finally {
      setBusy(false);
    }
  }

  if (access.data !== "super_admin") return null;

  return (
    <section className="surface space-y-4 p-5" aria-label="Admin Chat">
      <h2 className="font-bold">Admin Chat · {staffName}</h2>
      {messages.isError ? (
        <p role="alert">Could not load Admin Chat: {messages.error.message}</p>
      ) : (
        <div className="max-h-[45vh] space-y-3 overflow-y-auto">
          {(messages.data ?? []).map((entry) => (
            <article
              className={`max-w-[85%] rounded-xl p-3 text-sm ${entry.sender_role === "admin" ? "bg-primary/10" : "ml-auto bg-muted"}`}
              key={entry.id}
            >
              <p className="text-xs font-semibold">
                {entry.sender_role === "admin" ? "Admin" : "Staff"}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{entry.message}</p>
              <time className="mt-2 block text-right text-[10px] text-muted-foreground">
                {new Date(entry.created_at).toLocaleString()}
              </time>
            </article>
          ))}
          {!messages.isLoading && !messages.data?.length && (
            <p className="text-sm text-muted-foreground">No messages in this thread yet.</p>
          )}
        </div>
      )}
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <Label htmlFor={`admin-reply-${staffId}`}>Reply to {staffName}</Label>
        <Textarea
          id={`admin-reply-${staffId}`}
          rows={3}
          maxLength={4000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          required
        />
        <Button type="submit" disabled={busy || !message.trim()}>
          {busy ? "Sending…" : "Send reply"}
        </Button>
      </form>
    </section>
  );
}
