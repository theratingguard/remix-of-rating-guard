import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  enqueueBatch,
  getBatchJobs,
  controlBatch,
  retryJob,
  latestBatch,
} from "@/lib/queue.functions";
import { parseBulkInput, csvCell } from "@/lib/review-metrics";
import { Button } from "@/components/ui/button";
import { isGoogleMapsUrl } from "@/lib/google-url";
export const isGoogleUrl = isGoogleMapsUrl;
type BatchJobs = Awaited<ReturnType<typeof getBatchJobs>>;
export function BulkScan({ disabled }: { disabled: boolean }) {
  const enqueue = useServerFn(enqueueBatch);
  const load = useServerFn(getBatchJobs);
  const control = useServerFn(controlBatch);
  const retry = useServerFn(retryJob);
  const latest = useServerFn(latestBatch);
  const qc = useQueryClient();
  const [mode, setMode] = useState<"paste" | "pdf">("paste");
  const [text, setText] = useState("");
  const [batch, setBatch] = useState<{ id: string; batch_number: number } | null>(null);
  const [state, setState] = useState<BatchJobs | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checked = parseBulkInput(text);
  useEffect(() => {
    let active = true;
    void latest()
      .then((result) => {
        if (active && result) setBatch(result);
      })
      .catch((error) => {
        if (active)
          setError(error instanceof Error ? error.message : "Could not restore latest batch.");
      });
    return () => {
      active = false;
    };
  }, [latest]);
  const jobs = state?.jobs ?? [];
  const running = jobs.some((job) => job.status === "pending" || job.status === "processing");
  const refresh = useCallback(
    async (id: string) => {
      const result = await load({ data: { batchId: id } });
      setState(result);
    },
    [load],
  );
  useEffect(() => {
    if (!batch) return;
    let active = true;
    const tick = async () => {
      try {
        const result = await load({ data: { batchId: batch.id } });
        if (active) setState(result);
      } catch (error) {
        if (active)
          setError(error instanceof Error ? error.message : "Could not load batch progress.");
      }
    };
    void tick();
    const interval = setInterval(() => void tick(), 4000);
    return () => {
      active = false;
      clearInterval(interval);
      void qc.invalidateQueries({ queryKey: ["scans"] });
    };
  }, [batch, load, qc]);
  async function start() {
    setBusy(true);
    setError(null);
    try {
      const result = await enqueue({ data: { urls: checked.valid } });
      if (!result.ok) throw new Error(result.message);
      setBatch(result.batch);
      await refresh(result.batch.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not start bulk scan.");
    } finally {
      setBusy(false);
    }
  }
  async function change(action: "pause" | "resume" | "cancel") {
    if (!batch) return;
    setBusy(true);
    setError(null);
    try {
      await control({ data: { batchId: batch.id, action } });
      await refresh(batch.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Batch control failed.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { extractBulkPdf } = await import("@/lib/bulk-pdf");
      setText(await extractBulkPdf(file));
    } catch (error) {
      setError(error instanceof Error ? error.message : "PDF extraction failed.");
    } finally {
      setBusy(false);
    }
  }
  function exportCsv() {
    const header = [
      "#",
      "Business",
      "Input",
      "Rating",
      "Reviews fetched",
      "1-star",
      "2-star",
      "3-star",
      "4-star",
      "5-star",
      "High advisory",
      "Medium advisory",
      "Low advisory",
      "Status",
      "Error",
    ];
    const rows = jobs.map((job, index) => [
      index + 1,
      job.scan?.business_name,
      job.url,
      job.scan?.rating,
      job.scan?.reviews_retrieved,
      ...job.stars,
      job.removal.high,
      job.removal.medium,
      job.removal.low,
      job.status,
      job.error,
    ]);
    const url = URL.createObjectURL(
      new Blob([[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bulk-${batch?.id}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const finished = jobs.filter((job) =>
    ["completed", "partial", "failed", "cancelled"].includes(job.status),
  ).length;
  return (
    <section className="mt-6 rounded-2xl bg-card p-4 text-left">
      <h2 className="font-bold">Bulk Scan</h2>
      <p className="my-2 text-xs text-muted-foreground">
        Up to 500 inputs, including 100+ lines. One Google Maps URL or business name with city per
        line. Maximum 10 job starts/minute, processed sequentially. Ambiguous names require an exact
        Maps URL; no guessed match.
      </p>
      <div className="my-3 flex gap-2">
        <Button variant={mode === "paste" ? "default" : "outline"} onClick={() => setMode("paste")}>
          Copy-Paste
        </Button>
        <Button variant={mode === "pdf" ? "default" : "outline"} onClick={() => setMode("pdf")}>
          PDF Upload
        </Button>
      </div>
      {mode === "pdf" && (
        <>
          <label className="block">
            Upload text PDF (maximum 10 MB / 40 pages)
            <input
              aria-label="Bulk PDF file"
              type="file"
              accept="application/pdf,.pdf"
              disabled={busy || running}
              onChange={(event) => void upload(event.target.files?.[0])}
            />
          </label>
          <p className="text-xs">
            Extracted text is editable below. PDFs must contain selectable text, with one business
            or URL per line. Image-only PDFs are rejected explicitly.
          </p>
        </>
      )}
      <label htmlFor="bulk-input">URLs or business names (one per line)</label>
      <textarea
        id="bulk-input"
        rows={8}
        value={text}
        disabled={busy || running}
        onChange={(event) => setText(event.target.value)}
        placeholder={"The Hudson Albany\nhttps://goo.gl/maps/wTyktdb5u9M1VLFp9"}
        className="mt-2 w-full rounded border bg-transparent p-3"
      />
      <p className="my-2 text-sm">
        {checked.valid.length} inputs · {checked.duplicates.length} duplicates skipped ·{" "}
        {checked.invalid.length} invalid lines
      </p>
      {checked.invalid.length > 0 && (
        <p role="alert">
          Fix invalid lines before starting (minimum 3, maximum 2000 characters per line).
        </p>
      )}
      <Button
        disabled={
          disabled ||
          busy ||
          running ||
          !checked.valid.length ||
          checked.valid.length > 500 ||
          checked.invalid.length > 0
        }
        onClick={start}
      >
        {busy ? "Working..." : "Start Bulk Scan"}
      </Button>
      {error && (
        <p role="alert" className="my-3 text-risk-high">
          {error}
        </p>
      )}
      {batch && state && (
        <div className="mt-5">
          <h3 className="font-bold">
            {finished}/{jobs.length} scanned · Batch {batch.batch_number} · {state.controlStatus}
          </h3>
          <progress
            aria-label="Bulk scan progress"
            max={jobs.length || 1}
            value={finished}
            className="my-3 w-full"
          />
          <p className="text-xs">
            Counts include failures and cancellations; results retain individual status.
            Pause/cancel stops new jobs; the current job may finish. Progress continues if this page
            closes.
          </p>
          {state.paused && (
            <p role="alert">
              Global worker paused: {state.pauseReason}. An authorized admin must resolve provider
              issues.
            </p>
          )}
          <div className="my-3 flex gap-2">
            <Button
              variant="outline"
              disabled={busy || state.controlStatus === "cancelled"}
              onClick={() => change(state.controlStatus === "paused" ? "resume" : "pause")}
            >
              {state.controlStatus === "paused" ? "Resume" : "Pause"}
            </Button>
            <Button
              variant="outline"
              disabled={busy || !running || state.controlStatus === "cancelled"}
              onClick={() => change("cancel")}
            >
              Cancel
            </Button>
            <Button variant="outline" disabled={!jobs.length} onClick={exportCsv}>
              Export CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {[
                    "#",
                    "Business",
                    "Rating",
                    "Reviews",
                    "1★",
                    "2★",
                    "3★",
                    "4★",
                    "5★",
                    "Removal Possible (advisory)",
                    "Status",
                    "Action",
                  ].map((label) => (
                    <th key={label} className="p-2 text-left">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map((job, index) => (
                  <tr key={job.id} className="border-t">
                    <td className="p-2">{index + 1}</td>
                    <td className="p-2" title={job.url}>
                      {job.scan?.business_name ?? job.url}
                    </td>
                    <td className="p-2">{job.scan?.rating ?? "—"}</td>
                    <td className="p-2">{job.scan?.reviews_retrieved ?? "—"}</td>
                    {job.stars.map((count, index) => (
                      <td key={index} className="p-2">
                        {job.scan ? count : "—"}
                      </td>
                    ))}
                    <td className="p-2">
                      {job.scan
                        ? `🔴 ${job.removal.high} / 🟠 ${job.removal.medium} / 🟡 ${job.removal.low}`
                        : "—"}
                    </td>
                    <td className="p-2">
                      {job.status}
                      {job.error && <p className="max-w-xs text-risk-high">{job.error}</p>}
                    </td>
                    <td className="p-2">
                      {job.status === "completed" && job.scan_id && (
                        <Link to="/reports/$id" params={{ id: job.scan_id }}>
                          View
                        </Link>
                      )}
                      {["failed", "partial"].includes(job.status) &&
                        state.controlStatus !== "cancelled" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              try {
                                const result = await retry({ data: { jobId: job.id } });
                                if (!result.ok) throw new Error("Job is not retryable.");
                                await refresh(batch.id);
                              } catch (error) {
                                setError(error instanceof Error ? error.message : "Retry failed.");
                              }
                            }}
                          >
                            Retry
                          </Button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
