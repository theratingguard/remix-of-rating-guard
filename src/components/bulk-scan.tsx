import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2, RotateCcw } from "lucide-react";
import { enqueueBatch, processQueueNow, getBatchJobs, retryJob } from "@/lib/queue.functions";
import { Button } from "@/components/ui/button";

const MAX_URLS = 500;

type RowStatus = "pending" | "processing" | "completed" | "partial" | "failed";
type Row = { url: string; status: RowStatus; scanId?: string | undefined; error?: string | undefined; business?: string | null | undefined; rating?: number | null | undefined; reviews?: number | undefined; high?: number | undefined; medium?: number | undefined };
type Checked = { valid: string[]; invalid: string[]; duplicates: string[] };

export function isGoogleUrl(v: string) {
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return /(^|\.)google\.[a-z.]+$/.test(u.hostname) || /^(maps\.app\.goo\.gl|goo\.gl|g\.page|g\.co)$/.test(u.hostname);
  } catch { return false; }
}

function normalize(v: string) {
  try { const u = new URL(v.trim()); u.hash = ""; return (u.origin + u.pathname.replace(/\/+$/, "") + u.search).toLowerCase(); } catch { return v.trim().toLowerCase(); }
}

function parseInput(text: string): Checked {
  const lines = text.split(/\r?\n/).map((l) => l.split(",")[0]!.trim().replace(/^"|"$/g, "")).filter(Boolean)
    .filter((l) => !/^(google_url|url)$/i.test(l));
  const seen = new Set<string>(); const out: Checked = { valid: [], invalid: [], duplicates: [] };
  for (const l of lines) {
    if (!isGoogleUrl(l)) { out.invalid.push(l); continue; }
    const k = normalize(l);
    if (seen.has(k)) { out.duplicates.push(l); continue; }
    seen.add(k); out.valid.push(l.trim());
  }
  return out;
}

export function BulkScan({ disabled }: { disabled: boolean }) {
  const enqueue = useServerFn(enqueueBatch);
  const process = useServerFn(processQueueNow);
  const loadJobs = useServerFn(getBatchJobs);
  const retryFn = useServerFn(retryJob);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [checked, setChecked] = useState<Checked | null>(null);
  const [rows, setRows] = useState<(Row & { jobId: string })[]>([]);
  const [batch, setBatch] = useState<{ id: string; batch_number: number } | null>(null);
  const [starting, setStarting] = useState(false);
  const [paused, setPaused] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const running = rows.some((r) => r.status === "pending" || r.status === "processing");

  const refresh = useCallback(async (batchId: string) => {
    const r = await loadJobs({ data: { batchId } });
    setPaused(r.paused ? r.pauseReason ?? "Queue paused" : null);
    setRows(r.jobs.map((j) => ({ jobId: j.id, url: j.url, status: j.status as RowStatus, scanId: j.scan_id ?? undefined, error: j.status === "pending" && j.error ? `Retrying: ${j.error}` : j.error ?? undefined,
      business: j.scan?.business_name, rating: j.scan?.rating, reviews: j.scan?.reviews_retrieved, high: j.scan?.high_count, medium: j.scan?.medium_count })));
  }, [loadJobs]);

  // While the page is open: poll progress and nudge the worker. The scheduled worker continues if the page is closed.
  useEffect(() => {
    if (!batch || !running) return;
    let alive = true;
    const tick = async () => {
      try { await process(); } catch { /* scheduled worker will continue */ }
      if (alive) await refresh(batch.id);
    };
    const id = setInterval(() => { void refresh(batch.id); }, 4000);
    void tick();
    const kick = setInterval(() => { void tick(); }, 25000);
    return () => { alive = false; clearInterval(id); clearInterval(kick); qc.invalidateQueries({ queryKey: ["scans"] }); };
  }, [batch, running, process, refresh, qc]);

  async function start() {
    if (!checked?.valid.length) return;
    setErr(null); setStarting(true);
    try {
      const r = await enqueue({ data: { urls: checked.valid } });
      if (!r.ok) { setErr(r.message); return; }
      setBatch(r.batch);
      await refresh(r.batch.id);
    } catch (e) { setErr(e instanceof Error ? e.message : "Batch failed to start."); }
    finally { setStarting(false); }
  }

  async function retry(i: number) {
    if (!batch) return;
    await retryFn({ data: { jobId: rows[i]!.jobId } });
    await refresh(batch.id);
  }

  async function onFile(f: File | undefined) {
    if (!f) return; const t = await f.text(); setText(t); setChecked(parseInput(t)); setRows([]);
  }

  const count = (s: RowStatus) => rows.filter((r) => r.status === s).length;
  const tooMany = (checked?.valid.length ?? 0) > MAX_URLS;

  return (
    <div className="mt-6 rounded-2xl bg-card p-4 text-left text-foreground shadow-[var(--shadow-scanner-glow)]">
      <label htmlFor="bulk-urls" className="text-sm font-semibold">Paste URLs (one per line) or upload a CSV with a <span className="font-mono">google_url</span> column</label>
      <textarea id="bulk-urls" value={text} disabled={running} onChange={(e) => { setText(e.target.value); setChecked(null); }}
        rows={6} placeholder={"https://maps.app.goo.gl/...\nhttps://www.google.com/maps/place/..."}
        className="mt-2 w-full rounded-lg border bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring" />
      <div className="mt-3 flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <Button type="button" variant="outline" size="sm" disabled={running} onClick={() => fileRef.current?.click()}><Upload /> Upload CSV</Button>
        <Button type="button" variant="outline" size="sm" disabled={running || !text.trim()} onClick={() => { setChecked(parseInput(text)); setRows([]); }}>Validate</Button>
        <Button type="button" size="sm" disabled={disabled || running || starting || !checked?.valid.length || tooMany} onClick={start}>
          {(running || starting) && <Loader2 className="animate-spin" />} Start batch ({checked?.valid.length ?? 0})
        </Button>
      </div>

      {checked && (
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <Bucket label="Valid URLs" items={checked.valid} tone="text-risk-normal" />
          <Bucket label="Invalid URLs" items={checked.invalid} tone="text-risk-high" />
          <Bucket label="Duplicate URLs" items={checked.duplicates} tone="text-risk-medium" />
        </div>
      )}
      {tooMany && <p className="mt-2 text-sm text-risk-high">Maximum {MAX_URLS} URLs per batch.</p>}
      {paused && <p role="alert" className="mt-2 text-sm text-risk-high">Queue paused: {paused} An admin can resume it in Settings.</p>}
      {err && <p role="alert" className="mt-2 text-sm text-risk-high">{err}</p>}

      {batch && rows.length > 0 && (
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <b>Batch Scan #{batch.batch_number}</b>
            <span>Total {rows.length}</span><span>Completed {count("completed")}</span><span>Processing {count("processing")}</span>
            <span>Partial {count("partial")}</span><span>Failed {count("failed")}</span><span>Pending {count("pending")}</span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground"><tr className="border-b text-left">
                {["#", "Business", "URL", "Rating", "Reviews found", "High", "Medium", "Status", "Action"].map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}
              </tr></thead>
              <tbody>{rows.map((r, i) => (
                <tr key={i} className="border-b align-top">
                  <td className="p-2 font-mono">{i + 1}</td>
                  <td className="p-2">{r.business ?? "—"}</td>
                  <td className="max-w-[220px] truncate p-2 font-mono" title={r.url}>{r.url}</td>
                  <td className="p-2">{r.rating ?? "—"}</td>
                  <td className="p-2">{r.reviews ?? "—"}</td>
                  <td className="p-2">{r.high ?? "—"}</td>
                  <td className="p-2">{r.medium ?? "—"}</td>
                  <td className="p-2"><span className="capitalize">{r.status}</span>{r.error && <div className="mt-1 max-w-[220px] text-muted-foreground">{r.error}</div>}</td>
                  <td className="space-x-2 whitespace-nowrap p-2">
                    {r.scanId && <Link to="/reports/$id" params={{ id: r.scanId }} className="text-primary underline">View</Link>}
                    {(r.status === "failed" || r.status === "partial") && !running && <button type="button" onClick={() => retry(i)} className="inline-flex items-center gap-1 text-primary underline"><RotateCcw className="h-3 w-3" />Retry</button>}
                  </td>
                </tr>))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Bucket({ label, items, tone }: { label: string; items: string[]; tone: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className={`font-semibold ${tone}`}>{label}: {items.length}</div>
      {items.length > 0 && <ul className="mt-1 max-h-28 overflow-auto font-mono text-xs text-muted-foreground">{items.map((u, i) => <li key={i} className="truncate" title={u}>{u}</li>)}</ul>}
    </div>
  );
}
