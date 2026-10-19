import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, KeyRound, Loader2, X } from "lucide-react";
import { scanAnalyze, scanFetch, getSystemStatus } from "@/lib/scan.functions";
import { scanQuery } from "@/lib/data";
import { toast } from "sonner";
import { ReviewSelection } from "@/components/review-selection";
import { LegalAnalysisPanel } from "@/components/legal-analysis";
import { RemovalSummary } from "@/components/removal-summary";
import { BusinessHeader, RatingAnalysis, RiskAnalysis } from "@/components/scan-result";
import { Button } from "@/components/ui/button";
import { useFeatureSettings } from "@/lib/use-feature-settings";
import { isGoogleMapsUrl, isGoogleReviewUrl } from "@/lib/google-url";
import { RestrictedReportSummary } from "@/components/restricted-report-summary";
import { reportAccessQuery } from "@/lib/report-access";
import { SimpleScanReport } from "@/components/simple-scan-report";

export const Route = createFileRoute("/_authenticated/scan")({
  head: () => ({
    meta: [
      { title: "Google Review URL Scanner — Rating Guard" },
      { name: "description", content: "Scan a Google business for review policy risk." },
    ],
  }),
  component: ScanPage,
});

const STEPS = [
  "Resolving business",
  "Reading public business information",
  "Retrieving available reviews",
  "Analyzing review signals",
  "Saving report",
];
type Phase = "idle" | "queued" | "fetch" | "analyze" | "legal" | "done" | "error";

function looksLikeGoogleUrl(value: string) {
  return isGoogleMapsUrl(value);
}

export function ScanPage() {
  const navigate = useNavigate();
  const features = useFeatureSettings();
  const access = useQuery(reportAccessQuery());
  const status = useServerFn(getSystemStatus);
  const fetchStage = useServerFn(scanFetch);
  const analyzeStage = useServerFn(scanAnalyze);
  const queryClient = useQueryClient();
  const { data: systemStatus } = useQuery({
    queryKey: ["system-status"],
    queryFn: () => status(),
  });
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [failedAt, setFailedAt] = useState<"fetch" | "analyze" | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [background, setBackground] = useState(false);
  const progress = useQuery({
    ...scanQuery(scanId ?? ""),
    enabled: background && Boolean(scanId),
    refetchInterval: background ? 2000 : false,
  });

  useEffect(() => {
    const savedScanId = localStorage.getItem("rg-active-worker-scan");
    if (savedScanId) {
      setScanId(savedScanId);
      setBackground(true);
      setPhase("queued");
    }
  }, []);

  useEffect(() => {
    if (!background) return;
    if (progress.error) {
      setError({ code: "NETWORK", message: progress.error.message });
      return;
    }
    const current = progress.data?.scan;
    if (!current) return;
    if (current.status === "complete" || current.status === "failed") {
      setBackground(false);
      localStorage.removeItem("rg-active-worker-scan");
      if (current.status === "complete") {
        setPhase("done");
        toast.success(
          isGoogleReviewUrl(current.source_url)
            ? "Review link scan complete. Check whether the exact review was returned below."
            : "Background scan complete. Private report ready.",
        );
        void navigate({ to: "/scan-report/$id", params: { id: current.id } });
      } else {
        setPhase("error");
        setError({
          code: "WORKER_ERROR",
          message: current.error ?? "Worker scan failed. Inspect Error Center.",
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["scans"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-review-actions"] });
    } else {
      setPhase(
        current.stage === "queued"
          ? "queued"
          : current.stage === "fetch"
            ? "fetch"
            : current.stage === "legal"
              ? "legal"
              : "analyze",
      );
    }
  }, [background, navigate, progress.data, progress.error, queryClient]);

  const urlValid = looksLikeGoogleUrl(url);
  const singleReviewUrl = urlValid && isGoogleReviewUrl(url);
  const running = background || phase === "fetch" || phase === "analyze" || phase === "legal";
  const keyMissing = systemStatus && !systemStatus.googleConfigured;

  async function start(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!urlValid) return;
    setError(null);
    setScanId(null);
    setFailedAt(null);
    setPhase("fetch");
    let requestStage: "fetch" | "analyze" = "fetch";
    try {
      const fetched = await fetchStage({ data: { url: url.trim() } });
      if (!fetched.ok) {
        setFailedAt("fetch");
        setError(fetched);
        if (fetched.scanId) setScanId(fetched.scanId);
        setPhase("error");
        return;
      }
      setScanId(fetched.scanId);
      if (fetched.queued) {
        setBackground(true);
        setPhase("queued");
        localStorage.setItem("rg-active-worker-scan", fetched.scanId);
        toast.success(`Scan queued, ID: ${fetched.scanId}`);
        return;
      }
      setPhase("analyze");
      requestStage = "analyze";
      const analyzed = await analyzeStage({ data: { scanId: fetched.scanId } });
      if (!analyzed.ok) {
        setFailedAt("analyze");
        setError(analyzed);
        setPhase("error");
        return;
      }
      setPhase("done");
      toast.success(
        singleReviewUrl
          ? "Review link scan complete. Check whether the exact review was returned below."
          : features.data?.auto_pdf_enabled
            ? "Report ready. PDF automatically saved on the VPS."
            : "Report ready. Auto-PDF disabled in Settings.",
      );
      void navigate({ to: "/scan-report/$id", params: { id: fetched.scanId } });
    } catch (caught) {
      setFailedAt(requestStage);
      setError({
        code: "NETWORK",
        message:
          caught instanceof Error
            ? caught.message
            : "Network error. Check your connection and try again.",
      });
      setPhase("error");
    } finally {
      void queryClient.invalidateQueries({ queryKey: ["scans"] });
      void queryClient.invalidateQueries({ queryKey: ["scan"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-scans"] });
    }
  }

  function stepState(index: number): "done" | "active" | "failed" | "idle" {
    const inFetch = index < 3;
    if (phase === "done") return "done";
    if (phase === "fetch") return inFetch ? "active" : "idle";
    if (phase === "analyze") return inFetch ? "done" : "active";
    if (phase === "legal") return index < 4 ? "done" : "active";
    if (phase === "error") {
      if (failedAt === "fetch") return inFetch ? "failed" : "idle";
      return inFetch ? "done" : "failed";
    }
    return "idle";
  }

  if (access.error)
    return <p role="alert">Could not verify report access: {access.error.message}</p>;
  if (access.isPending) return <p>Verifying report access…</p>;
  if (access.data !== "super_admin") return <RestrictedReportSummary />;

  return (
    <main className="mx-auto w-full min-w-0 max-w-4xl space-y-5">
      <section
        aria-label="Google Review URL Scanner"
        className="bg-scanner-green relative overflow-hidden rounded-3xl border border-scanner-accent/30 p-4 text-foreground shadow-[var(--shadow-lift)] sm:p-8"
      >
        <div className="grid-lines-green absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-3xl">
          <h1 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Google Review URL Scanner
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm opacity-75">
            Paste a Google Maps business or review URL. Country and region are detected from
            Google's business details.
          </p>

          {keyMissing && (
            <div className="mt-5 flex items-start gap-3 rounded-xl bg-card/80 p-4 text-left text-sm shadow-[var(--shadow-soft)] ring-1 ring-scanner-accent/40">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-scanner-deep" aria-hidden />
              <div className="flex-1">
                <b>Google Places API · Configuration required.</b> Live scanning activates once the
                API key is added.
              </div>
              <Button variant="outline" asChild className="min-h-[48px]">
                <Link to="/settings">Configure API</Link>
              </Button>
            </div>
          )}

          <form onSubmit={start} noValidate className="mt-6 space-y-3 rounded-2xl bg-card p-3">
            <label htmlFor="maps-url" className="block text-left text-sm font-semibold">
              Paste URL
            </label>
            <input
              id="maps-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onBlur={() => setTouched(true)}
              disabled={running}
              aria-invalid={touched && !!url && !urlValid}
              aria-describedby="url-help"
              placeholder="Paste Google Maps business or review URL"
              className="min-h-[48px] w-full min-w-0 rounded-md border bg-background px-3 text-base text-foreground outline-none placeholder:text-muted-foreground"
            />
            <Button
              type="submit"
              size="lg"
              variant="green"
              className="min-h-[48px] w-full text-base"
              disabled={running || !!keyMissing}
            >
              {running && <Loader2 className="animate-spin" aria-hidden />}
              {singleReviewUrl ? "Scan URL" : "Scan"}
            </Button>
          </form>
          <p id="url-help" className="mt-2 min-h-5 text-left text-sm" role="status">
            {touched && url && !urlValid ? (
              <span className="text-star">
                Invalid Google URL. Use a Google Maps business, review, or short link.
              </span>
            ) : (
              <span className="opacity-70">
                {singleReviewUrl
                  ? "The scan checks Google’s available public review sample; it cannot guarantee a removal."
                  : "Only Google Maps URLs are supported."}
              </span>
            )}
          </p>

          {phase !== "idle" && (
            <ol className="mt-5 grid gap-2 text-left sm:grid-cols-5" aria-label="Scan progress">
              {STEPS.map((step, index) => {
                const state = stepState(index);
                return (
                  <li
                    key={step}
                    aria-current={state === "active" ? "step" : undefined}
                    className={`relative overflow-hidden rounded-xl p-3 text-xs transition-all duration-500 ${state === "done" ? "bg-card/70" : state === "active" ? "bg-card/70 ring-1 ring-scanner-accent" : state === "failed" ? "bg-risk-high-soft ring-1 ring-risk-high" : "bg-card/40 opacity-55"}`}
                  >
                    <div className="flex items-center gap-2 font-mono opacity-80">
                      {state === "done" ? (
                        <Check className="h-3.5 w-3.5 text-scanner-deep" aria-hidden />
                      ) : state === "active" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : state === "failed" ? (
                        <X className="h-3.5 w-3.5" aria-hidden />
                      ) : null}
                      0{index + 1} <span className="sr-only">{state}</span>
                    </div>
                    <div className="mt-1 font-medium">{step}</div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>

      {background && scanId && (
        <p role="status" className="surface p-4 text-sm">
          {phase === "queued" ? "Scan queued" : "Processing"} · ID: {scanId}. Progress is saved and
          will resume when this page is reopened.
        </p>
      )}
      {error && (
        <div role="alert" className="surface flex items-start gap-3 border-risk-high/30 p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-risk-high" aria-hidden />
          <div className="flex-1">
            <div className="font-semibold">{errorTitle(error.code)}</div>
            <div className="mt-1 text-sm text-muted-foreground">{error.message}</div>
          </div>
          {error.code === "GOOGLE_API_NOT_CONFIGURED" && (
            <Button variant="outline" asChild className="min-h-[48px]">
              <Link to="/settings">Configure API</Link>
            </Button>
          )}
        </div>
      )}
      {scanId && phase !== "fetch" && <ScanResult id={scanId} />}
    </main>
  );
}

function errorTitle(code: string) {
  return (
    (
      {
        INVALID_URL: "Invalid Google URL",
        RESOLVE_FAILED: "Link could not be resolved",
        NOT_FOUND: "Business not found",
        API_UNAVAILABLE: "Google API error",
        GOOGLE_API_NOT_CONFIGURED: "Google API not configured",
        RATE_LIMIT: "API quota / rate limit",
        INSUFFICIENT_DATA: "Insufficient data",
        NO_REVIEWS: "No available reviews",
        GOOGLE_ERROR: "Google API error",
        NETWORK: "Network error",
        AI_UNAVAILABLE: "AI analysis unavailable",
        DB_UNAVAILABLE: "Database unavailable",
        WORKER_ERROR: "Background scan failed",
      } as Record<string, string>
    )[code] ?? "Scan failed"
  );
}

function ScanResult({ id }: { id: string }) {
  const { data } = useQuery(scanQuery(id));
  if (!data?.scan?.business_name) return null;
  if (isGoogleReviewUrl(data.scan.source_url)) {
    return data.scan.status === "complete" ? (
      <SimpleScanReport scanId={id} />
    ) : (
      <p className="surface p-5" role="status">
        Analyzing the specific review link. The report will appear once the scan is complete.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      <BusinessHeader scan={data.scan} />
      <RatingAnalysis scan={data.scan} reviews={data.reviews} />
      <RemovalSummary metadata={data.report?.report_data} total={data.reviews.length} />
      <ReviewSelection key={id} scan={data.scan} reviews={data.reviews} report={data.report} />
      <LegalAnalysisPanel scan={data.scan} reviews={data.reviews} report={data.report} />
      <RiskAnalysis scan={data.scan} reviews={data.reviews} />
    </div>
  );
}
