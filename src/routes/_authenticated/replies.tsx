import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, Copy, ExternalLink, Save, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  listAllReplyDrafts,
  saveReplyDraft,
  setReplyDraftStatus,
  type ReplyDraftListItem,
} from "@/lib/reply.functions";

export const Route = createFileRoute("/_authenticated/replies")({
  head: () => ({
    meta: [
      { title: "Reply Drafts — Rating Guard Remix" },
      { name: "description", content: "Review and manage saved business reply drafts." },
    ],
  }),
  component: ReplyDraftsPage,
});

function ReplyDraftsPage() {
  const loadDrafts = useServerFn(listAllReplyDrafts);
  const saveDraft = useServerFn(saveReplyDraft);
  const updateStatus = useServerFn(setReplyDraftStatus);
  const queryClient = useQueryClient();
  const draftsQuery = useQuery({
    queryKey: ["reply-drafts"],
    queryFn: () => loadDrafts(),
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedText, setEditedText] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const drafts = draftsQuery.data ?? [];

  const refreshDrafts = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["reply-drafts"] }),
      queryClient.invalidateQueries({ queryKey: ["reply-automation-settings"] }),
    ]);
  };

  const save = async (draft: ReplyDraftListItem) => {
    if (savingId) return;
    setSavingId(draft.id);
    try {
      await saveDraft({ data: { draftId: draft.id, replyText: editedText } });
      await refreshDrafts();
      setEditingId(null);
      toast.success("Reply draft saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this reply draft.");
    } finally {
      setSavingId(null);
    }
  };

  const decide = async (draft: ReplyDraftListItem, status: "approved" | "rejected") => {
    if (savingId) return;
    setSavingId(draft.id);
    try {
      await updateStatus({
        data: {
          draftId: draft.id,
          replyText: editingId === draft.id ? editedText : draft.reply_text,
          status,
        },
      });
      await refreshDrafts();
      setEditingId(null);
      toast.success(status === "approved" ? "Reply approved" : "Reply rejected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update this reply draft.");
    } finally {
      setSavingId(null);
    }
  };

  const copyApprovedReply = async (reply: string) => {
    try {
      await navigator.clipboard.writeText(reply);
      toast.success("Approved reply copied. Post it manually on Google.");
    } catch (error) {
      console.error("[reply-drafts] Could not copy approved reply", error);
      toast.error("Could not copy this reply. Select and copy the text manually.");
    }
  };

  return (
    <>
      <PageHeader
        title="Reply Drafts"
        subtitle="Edit, approve, or reject saved replies. Google posting must be done manually."
        action={
          <Button variant="outline" asChild>
            <Link to="/settings">Auto Reply Settings</Link>
          </Button>
        }
      />

      {draftsQuery.isPending && <p className="text-sm text-muted-foreground">Loading drafts…</p>}
      {draftsQuery.isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not load reply drafts: {draftsQuery.error.message}
        </p>
      )}
      {draftsQuery.isSuccess && drafts.length === 0 && (
        <section className="surface p-6 text-sm text-muted-foreground">
          No reply drafts yet. Enable Auto Reply in Settings or generate a draft from a review
          report.
        </section>
      )}

      <div className="space-y-4">
        {drafts.map((draft) => {
          const isEditing = editingId === draft.id;
          const isSaving = savingId === draft.id;
          return (
            <article key={draft.id} className="surface space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <h2 className="font-semibold">{draft.businessName}</h2>
                  <p className="text-sm text-muted-foreground">
                    {draft.review.author} · {draft.review.rating}/5 · Tone:{" "}
                    <span className="capitalize">{draft.tone}</span>
                  </p>
                  {draft.review.text && (
                    <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">
                      {draft.review.text}
                    </blockquote>
                  )}
                  {draft.review.review_url && (
                    <a
                      href={draft.review.review_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      View original review <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize">
                  {draft.status}
                </span>
              </div>

              {isEditing ? (
                <Textarea
                  aria-label={`Edit reply for ${draft.review.author}`}
                  value={editedText}
                  onChange={(event) => setEditedText(event.target.value)}
                  maxLength={4000}
                  rows={5}
                  disabled={isSaving}
                />
              ) : (
                <p className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm">
                  {draft.reply_text}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {draft.status === "draft" && (
                  <>
                    {isEditing ? (
                      <>
                        <Button onClick={() => void save(draft)} disabled={isSaving}>
                          <Save /> Save
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setEditingId(null)}
                          disabled={isSaving}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingId(draft.id);
                          setEditedText(draft.reply_text);
                        }}
                      >
                        Edit
                      </Button>
                    )}
                    <Button
                      onClick={() => void decide(draft, "approved")}
                      disabled={isSaving || (isEditing && !editedText.trim())}
                    >
                      <Check /> Approve
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => void decide(draft, "rejected")}
                      disabled={isSaving}
                    >
                      <X /> Reject
                    </Button>
                  </>
                )}
                {draft.status === "approved" && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => void copyApprovedReply(draft.reply_text)}
                    >
                      <Copy /> Copy to send
                    </Button>
                    <Button
                      disabled
                      title="Google Business Profile reply posting is not connected."
                    >
                      Send
                    </Button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
