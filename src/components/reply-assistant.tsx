import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { suggestReply, REPLY_TONES, type ReplySuggestion } from "@/lib/reply.functions";

export function ReplyAssistant({ reviewId }: { reviewId: string }) {
  const run = useServerFn(suggestReply);
  const [tone, setTone] = useState<(typeof REPLY_TONES)[number]>("professional");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [s, setS] = useState<ReplySuggestion | null>(null);
  const [draft, setDraft] = useState("");

  const go = async () => {
    setLoading(true); setError(null);
    try {
      const r = await run({ data: { reviewId, tone } });
      if (r.ok) { setS(r.suggestion); setDraft(r.suggestion.reply); } else setError(r.message);
    } catch { setError("Reply suggestion failed. Try again."); }
    setLoading(false);
  };

  return (
    <section className="surface space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="size-4 text-primary" /> Vala AI · Reply assistant</h3>
        <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
          <SelectTrigger className="h-8 w-36 capitalize"><SelectValue /></SelectTrigger>
          <SelectContent>{REPLY_TONES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Button onClick={go} disabled={loading} className="w-full">
        {loading ? <Loader2 className="animate-spin" /> : <Sparkles />} {s ? "Regenerate reply" : "Suggest reply"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {s && (
        <div className="space-y-3 text-sm">
          <p><span className="font-semibold">Summary: </span>{s.summary}</p>
          <p><span className="font-semibold">Risk explanation: </span>{s.riskExplanation}</p>
          <p><span className="font-semibold">Recommended action: </span>{s.recommendedAction}</p>
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={6} />
          <Button variant="outline" className="w-full" onClick={async () => { await navigator.clipboard.writeText(draft); toast.success("Reply copied"); }}>
            <Copy /> Copy reply
          </Button>
          <p className="text-xs text-muted-foreground">Suggestion only — edit before posting. Nothing is posted automatically. Model: {s.model}</p>
        </div>
      )}
    </section>
  );
}
