import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Loader2, Save, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listReplyDrafts,
  REPLY_TONES,
  saveReplyDraft,
  setReplyDraftStatus,
  suggestReply,
  type ReplySuggestion,
} from "@/lib/reply.functions";

export function ReplyAssistant({ reviewId }: { reviewId: string }) {
  const run = useServerFn(suggestReply);
  const loadDrafts = useServerFn(listReplyDrafts);
  const saveDraft = useServerFn(saveReplyDraft);
  const updateStatus = useServerFn(setReplyDraftStatus);
  const queryClient = useQueryClient();
  const drafts = useQuery({
    queryKey: ["reply-drafts", reviewId],
    queryFn: () => loadDrafts({ data: { reviewId } }),
  });
  const [tone, setTone] = useState<(typeof REPLY_TONES)[number]>("professional");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [s, setS] = useState<ReplySuggestion | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const activeDraft = drafts.data?.find((item) => item.id === activeDraftId);

  useEffect(() => {
    if (activeDraftId || !drafts.data?.length) return;
    const latest = drafts.data[0]!;
    setActiveDraftId(latest.id);
    setDraft(latest.reply_text);
  }, [activeDraftId, drafts.data]);

  const go = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await run({ data: { reviewId, tone } });
      if (r.ok) {
        setS(r.suggestion);
        setActiveDraftId(r.suggestion.id);
        setDraft(r.suggestion.reply);
        await queryClient.invalidateQueries({ queryKey: ["reply-drafts", reviewId] });
        toast.success("Reply draft generated and saved");
      } else setError(r.message);
    } catch {
      setError("Reply suggestion failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!activeDraftId || saving || activeDraft?.status !== "draft") return;
    setSaving(true);
    try {
      await saveDraft({ data: { draftId: activeDraftId, replyText: draft } });
      await queryClient.invalidateQueries({ queryKey: ["reply-drafts", reviewId] });
      toast.success("Reply draft saved");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save this reply draft.");
    } finally {
      setSaving(false);
    }
  };

  const decide = async (status: "approved" | "rejected") => {
    if (!activeDraftId || saving || activeDraft?.status !== "draft") return;
    setSaving(true);
    try {
      await updateStatus({ data: { draftId: activeDraftId, replyText: draft, status } });
      await queryClient.invalidateQueries({ queryKey: ["reply-drafts", reviewId] });
      toast.success(
        status === "approved"
          ? "Reply approved. It has not been posted to Google."
          : "Reply rejected",
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not update this reply draft.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="surface space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" /> Vala AI · Reply assistant
        </h3>
        <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
          <SelectTrigger className="h-8 w-36 capitalize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPLY_TONES.map((t) => (
              <SelectItem key={t} value={t} className="capitalize">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button onClick={go} disabled={loading} className="w-full">
        {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}{" "}
        {s ? "Regenerate reply" : "Suggest reply"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {drafts.isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not load saved reply drafts.
        </p>
      )}
      {drafts.data && drafts.data.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Saved drafts</h4>
          <ul className="space-y-2">
            {drafts.data.map((item) => (
              <li key={item.id}>
                <Button
                  variant="outline"
                  className="h-auto w-full justify-between gap-3 text-left"
                  onClick={() => {
                    setActiveDraftId(item.id);
                    setDraft(item.reply_text);
                    setS(null);
                  }}
                >
                  <span className="truncate">{item.reply_text}</span>
                  <span className="shrink-0 text-xs capitalize">{item.status}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {drafts.isLoading && <p className="text-xs text-muted-foreground">Loading saved drafts…</p>}
      {(s || activeDraft) && (
        <div className="space-y-3 text-sm">
          {s && (
            <>
              <p>
                <span className="font-semibold">Summary: </span>
                {s.summary}
              </p>
              <p>
                <span className="font-semibold">Risk explanation: </span>
                {s.riskExplanation}
              </p>
              <p>
                <span className="font-semibold">Recommended action: </span>
                {s.recommendedAction}
              </p>
            </>
          )}
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            disabled={activeDraft?.status !== "draft"}
          />
          {activeDraft?.status === "draft" && (
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" onClick={() => void save()} disabled={saving}>
                <Save /> Save
              </Button>
              <Button onClick={() => void decide("approved")} disabled={saving}>
                <Check /> Approve
              </Button>
              <Button variant="outline" onClick={() => void decide("rejected")} disabled={saving}>
                <X /> Reject
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            className="w-full"
            onClick={async () => {
              await navigator.clipboard.writeText(draft);
              toast.success("Reply copied");
            }}
          >
            <Copy /> Copy reply
          </Button>
          <p className="text-xs text-muted-foreground">
            {activeDraft?.status === "approved"
              ? "Approved for manual use; not posted to Google."
              : activeDraft?.status === "rejected"
                ? "This draft was rejected."
                : "Editable draft only. Approval does not post to Google."}{" "}
            {s && `Model: ${s.model}`}
          </p>
        </div>
      )}
    </section>
  );
}
