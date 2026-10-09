import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2 } from "lucide-react";
import { listCompletedBatches, generateBatchInsights, type BatchInsights } from "@/lib/batch-insights.functions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const pCls: Record<string, string> = {
  high: "bg-risk-high-soft text-risk-high",
  medium: "bg-risk-medium-soft text-risk-medium",
  low: "bg-risk-normal-soft text-risk-normal",
};

export function BatchInsightsPanel() {
  const listFn = useServerFn(listCompletedBatches);
  const genFn = useServerFn(generateBatchInsights);
  const { data: batches = [], isLoading } = useQuery({ queryKey: ["completed-batches"], queryFn: () => listFn() });
  const [batchId, setBatchId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<BatchInsights | null>(null);

  async function run() {
    if (!batchId) return;
    setBusy(true); setErr(null); setRes(null);
    try {
      const r = await genFn({ data: { batchId } });
      if (r.ok) setRes(r.insights); else setErr(r.message);
    } catch { setErr("The server did not respond. Try again."); }
    finally { setBusy(false); }
  }

  return (
    <section className="surface mb-6 p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary" aria-hidden /> Batch insights</h2>
          <p className="text-xs text-muted-foreground">Pick a completed bulk batch to summarize review themes and rank businesses for follow-up. Based only on available retrieved reviews.</p>
        </div>
        <div className="flex gap-2">
          <Select value={batchId} onValueChange={setBatchId} disabled={isLoading || batches.length === 0}>
            <SelectTrigger className="w-64"><SelectValue placeholder={isLoading ? "Loading batches…" : batches.length ? "Select a batch" : "No completed batches yet"} /></SelectTrigger>
            <SelectContent>
              {batches.map((b) => <SelectItem key={b.id} value={b.id}>Batch #{b.batch_number} · {b.completed}/{b.total} complete</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={run} disabled={!batchId || busy}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy ? "Analyzing…" : "Generate"}</Button>
        </div>
      </div>

      {err && <p role="alert" className="text-sm text-risk-high">{err}</p>}

      {res && (
        <div className="space-y-5">
          <p className="text-sm">{res.overview}</p>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Review themes</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {res.themes.map((t, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <div className="font-medium text-sm">{t.theme}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.detail}</p>
                  {t.businesses.length > 0 && <p className="mt-2 text-xs">{t.businesses.join(" · ")}</p>}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Follow-up priority</h3>
            <ol className="space-y-2">
              {res.priorities.map((p, i) => (
                <li key={i} className="flex flex-wrap items-start gap-3 rounded-lg border p-3 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${pCls[p.priority]}`}>{p.priority}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{p.business}</div>
                    <p className="text-xs text-muted-foreground">{p.reason}</p>
                    <p className="mt-1 text-xs">→ {p.action}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <p className="text-xs text-muted-foreground">AI-generated from {res.scansAnalyzed} completed scan(s) · {res.model}. Not a determination of policy violation.</p>
        </div>
      )}
    </section>
  );
}
