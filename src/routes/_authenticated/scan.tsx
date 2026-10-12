import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Search, KeyRound, AlertTriangle, X } from "lucide-react";
import { scanFetch, scanAnalyze, getSystemStatus, findBusinesses } from "@/lib/scan.functions";
import { scanQuery } from "@/lib/data";
import { toast } from "sonner";
import { ReviewSelection } from "@/components/review-selection";
import { LegalAnalysisPanel } from "@/components/legal-analysis";
import { RemovalSummary } from "@/components/removal-summary";
import { BusinessHeader, RatingAnalysis, RiskAnalysis } from "@/components/scan-result";
import { Button } from "@/components/ui/button";
import { BulkScan } from "@/components/bulk-scan";
import { useFeatureSettings } from "@/lib/use-feature-settings";
import { isGoogleMapsUrl } from "@/lib/google-url";
import { reportAccessQuery, RestrictedReportSummary } from "@/components/restricted-report-summary";
import { isRegion, REGION_OPTIONS, type Region } from "@/lib/regional-routing";

export const Route = createFileRoute("/_authenticated/scan")({
  head: () => ({
    meta: [
      { title: "New Scan — Rating Guard Remix" },
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
  "Legal assessment and saving PDFs",
];
// Steps 1-3 belong to the server "fetch" stage, 4-5 to the "analyze" stage.
type Phase = "idle" | "queued" | "fetch" | "analyze" | "legal" | "done" | "error";

function looksLikeGoogleUrl(v: string) {
  return isGoogleMapsUrl(v);
}

function ScanPage() {
  const features = useFeatureSettings();
  const access = useQuery(reportAccessQuery());
  const status = useServerFn(getSystemStatus);
  const fetchStage = useServerFn(scanFetch);
  const analyzeStage = useServerFn(scanAnalyze);
  const qc = useQueryClient();
  const { data: sys } = useQuery({ queryKey: ["system-status"], queryFn: () => status() });
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [url, setUrl] = useState("");
  const [regionOverride, setRegionOverride] = useState<Region | "">("");
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
    const saved = localStorage.getItem("rg-active-worker-scan");
    if (saved) {
      setScanId(saved);
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
        toast.success("Background scan complete. Private report ready.");
      } else {
        setPhase("error");
        setError({
          code: "WORKER_ERROR",
          message: current.error ?? "Worker scan failed. Inspect Error Center.",
        });
      }
      void qc.invalidateQueries({ queryKey: ["scans"] });
    } else
      setPhase(
        current.stage === "queued"
          ? "queued"
          : current.stage === "fetch"
            ? "fetch"
            : current.stage === "legal"
              ? "legal"
              : "analyze",
      );
  }, [background, progress.data, progress.error, qc]);
  const find = useServerFn(findBusinesses);
  const [businessQuery, setBusinessQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [businesses, setBusinesses] = useState<{ name: string; address: string; url: string }[]>(
    [],
  );
  const [searchMessage, setSearchMessage] = useState<string | null>(null);

  async function searchNames(event: React.FormEvent) {
    event.preventDefault();
    setSearching(true);
    setBusinesses([]);
    setSearchMessage(null);
    try {
      const results = await find({ data: { query: businessQuery } });
      setBusinesses(results);
      if (results.length === 0)
        setSearchMessage("No businesses found. Add a city or use a Google Maps URL.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Business search failed.";
      setSearchMessage(message);
      toast.error(message);
    } finally {
      setSearching(false);
    }
  }

  const urlValid = looksLikeGoogleUrl(url);
  const running = background || phase === "fetch" || phase === "analyze" || phase === "legal";
  const keyMissing = sys && !sys.googleConfigured;

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!urlValid) return;
    setError(null);
    setScanId(null);
    setFailedAt(null);
    setPhase("fetch");
    let requestStage: "fetch" | "analyze" = "fetch";
    try {
      const a = await fetchStage({
        data: { url: url.trim(), ...(regionOverride ? { region: regionOverride } : {}) },
      });
      if (!a.ok) {
        setFailedAt("fetch");
        setError(a);
        if (a.scanId) setScanId(a.scanId);
        setPhase("error");
        return;
      }
      setScanId(a.scanId);
      if (a.queued) {
        setBackground(true);
        setPhase("queued");
        localStorage.setItem("rg-active-worker-scan", a.scanId);
        toast.success(`Scan queued, ID: ${a.scanId}`);
        return;
      }
      setPhase("analyze");
      requestStage = "analyze";
      const b = await analyzeStage({ data: { scanId: a.scanId } });
      if (!b.ok) {
        setFailedAt("analyze");
        setError(b);
        setPhase("error");
        return;
      }
      setPhase("done");
      toast.success(
        features.data?.auto_pdf_enabled
          ? "Report ready. PDF automatically saved on the VPS."
          : "Report ready. Auto-PDF disabled in Settings.",
      );
    } catch (error) {
      setFailedAt(requestStage);
      setError({
        code: "NETWORK",
        message:
          error instanceof Error
            ? error.message
            : "Network error. Check your connection and try again.",
      });
      setPhase("error");
    } finally {
      qc.invalidateQueries({ queryKey: ["scans"] });
      qc.invalidateQueries({ queryKey: ["scan"] });
    }
  }

  function stepState(i: number): "done" | "active" | "failed" | "idle" {
    const inFetch = i < 3;
    if (phase === "done") return "done";
    if (phase === "fetch") return inFetch ? "active" : "idle";
    if (phase === "analyze") return inFetch ? "done" : "active";
    if (phase === "legal") return i < 4 ? "done" : "active";
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
    <>
      <div className="bg-scanner-green relative overflow-hidden rounded-3xl border border-scanner-accent/30 p-6 text-foreground shadow-[var(--shadow-lift)] sm:p-12">
        <div className="grid-lines-green absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Scan a Google Business</h1>
          <p className="mx-auto mt-3 max-w-xl opacity-75">
            Paste a public Google Maps URL, or search by business name and choose the exact business
            to analyze available rating and review information.
          </p>
          <p className="mt-2 text-xs opacity-75">
            {features.data?.auto_pdf_enabled
              ? "Scanning automatically saves a private PDF."
              : "Auto-PDF is disabled or Settings are loading; manual PDF export remains available."}{" "}
            Only Super Admin (theratingguard@gmail.com) can view details and PDFs; every other
            account receives summaries only.
          </p>

          {keyMissing && (
            <div className="mt-6 flex items-start gap-3 rounded-xl bg-card/80 p-4 text-left text-sm shadow-[var(--shadow-soft)] ring-1 ring-scanner-accent/40">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-scanner-deep" aria-hidden />
              <div className="flex-1">
                <b>Google Places API · Configuration required.</b> Live scanning activates
                automatically once the API key is added.
              </div>
              <Link
                to="/settings"
                className="shrink-0 rounded-md bg-scanner-deep px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-[var(--shadow-btn)] hover:bg-scanner-deep/90"
              >
                Configure API
              </Link>
            </div>
          )}

          <div
            role="tablist"
            aria-label="Scan mode"
            className="mt-6 inline-flex rounded-full bg-card/70 p-1 text-sm shadow-[var(--shadow-soft)] ring-1 ring-scanner-accent/30"
          >
            {(["single", "bulk"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                type="button"
                aria-selected={mode === m}
                disabled={running || (m === "bulk" && !features.data?.bulk_scan_enabled)}
                onClick={() => setMode(m)}
                className={`rounded-full px-4 py-1.5 font-semibold transition-colors ${mode === m ? "bg-card text-foreground shadow-[var(--shadow-soft)]" : "opacity-70 hover:opacity-100"}`}
              >
                {m === "single" ? "Single URL" : "Bulk URLs"}
              </button>
            ))}
          </div>
          {mode === "bulk" ? (
            features.data?.bulk_scan_enabled ? (
              <BulkScan disabled={!!keyMissing} />
            ) : (
              <p>Bulk Scan disabled in Settings.</p>
            )
          ) : (
            <>
              <form
                onSubmit={searchNames}
                className="mt-5 flex flex-wrap gap-2 rounded-2xl bg-card p-3 text-left"
              >
                <label htmlFor="business-name" className="text-sm font-semibold">
                  Find by business name (include city)
                </label>
                <input
                  id="business-name"
                  value={businessQuery}
                  onChange={(event) => setBusinessQuery(event.target.value)}
                  disabled={running || searching}
                  placeholder="The Hudson Albany"
                  minLength={3}
                  maxLength={200}
                  className="min-w-0 flex-1 rounded border bg-transparent p-2"
                />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={running || searching || !!keyMissing || businessQuery.trim().length < 3}
                >
                  {searching ? "Searching..." : "Find business"}
                </Button>
              </form>
              {searchMessage && (
                <p role="status" className="mt-2 text-sm">
                  {searchMessage}
                </p>
              )}
              {businesses.length > 0 && (
                <div className="mt-3 space-y-2 text-left">
                  <p className="text-sm">
                    Choose the correct business and address; results are not scanned automatically.
                  </p>
                  {businesses.map((business) => (
                    <div
                      key={business.url}
                      className="flex items-center justify-between gap-3 rounded border bg-card p-3"
                    >
                      <div>
                        <b>{business.name}</b>
                        <p className="text-sm">{business.address}</p>
                      </div>
                      <Button
                        variant="outline"
                        disabled={running}
                        onClick={() => {
                          setUrl(business.url);
                          setTouched(false);
                          setBusinesses([]);
                          setSearchMessage(
                            `Selected ${business.name}, ${business.address}. Click Scan business to continue.`,
                          );
                        }}
                      >
                        Choose business
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <form
                onSubmit={start}
                noValidate
                className="mt-6 flex flex-col gap-3 rounded-2xl bg-card p-2 shadow-[var(--shadow-scanner-glow)] sm:flex-row"
              >
                <label htmlFor="maps-url" className="sr-only">
                  Google Maps or Business URL
                </label>
                <div className="flex flex-1 items-center gap-3 px-3">
                  <Search className="h-5 w-5 text-muted-foreground" aria-hidden />
                  <input
                    id="maps-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onBlur={() => setTouched(true)}
                    disabled={running}
                    aria-invalid={touched && !!url && !urlValid}
                    aria-describedby="url-help"
                    placeholder="Paste Google Maps / Business URL"
                    className="h-14 w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  variant="green"
                  className="h-14 px-8"
                  disabled={running || !!keyMissing}
                >
                  {running && <Loader2 className="animate-spin" />} Scan business
                </Button>
              </form>
              <p id="url-help" className="mt-2 min-h-5 text-left text-xs" role="status">
                {touched && url && !urlValid ? (
                  <span className="text-star">
                    Invalid Google URL — use a link like google.com/maps/place/… or
                    maps.app.goo.gl/…
                  </span>
                ) : (
                  <span className="opacity-60">
                    Supports google.com/maps/place, maps.app.goo.gl, g.page and ?q=place_id links.
                  </span>
                )}
              </p>
              <label className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium">Business country / region</span>
                <select
                  value={regionOverride}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRegionOverride(isRegion(value) ? value : "");
                  }}
                  disabled={running}
                  className="rounded border bg-card px-3 py-2"
                >
                  <option value="">Detect from Google business address</option>
                  {REGION_OPTIONS.map((region) => (
                    <option key={region.value} value={region.value}>
                      {region.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  Used only when the business country cannot be identified from its Google address.
                </span>
              </label>
            </>
          )}

          {mode === "single" && phase !== "idle" && (
            <ol className="mt-6 grid gap-2 text-left sm:grid-cols-5" aria-label="Scan progress">
              {STEPS.map((step, i) => {
                const s =
                  i === 4 && !features.data?.auto_pdf_enabled
                    ? "Saving report data (Auto-PDF off)"
                    : step;
                const st = stepState(i);
                return (
                  <li
                    key={s}
                    aria-current={st === "active" ? "step" : undefined}
                    className={`relative overflow-hidden rounded-xl p-3 text-xs transition-all duration-500 ${st === "done" ? "bg-card/70" : st === "active" ? "bg-card/70 ring-1 ring-scanner-accent" : st === "failed" ? "bg-risk-high-soft ring-1 ring-risk-high" : "bg-card/40 opacity-55"}`}
                  >
                    {st === "active" && (
                      <div
                        className="animate-sweep absolute inset-0 bg-gradient-to-r from-transparent via-scanner-accent/15 to-transparent"
                        aria-hidden
                      />
                    )}
                    <div className="relative flex items-center gap-2 font-mono opacity-80">
                      {st === "done" ? (
                        <Check className="h-3.5 w-3.5 text-scanner-deep" aria-hidden />
                      ) : st === "active" ? (
                        <span
                          className="animate-pulse-ring h-2 w-2 rounded-full bg-scanner-accent"
                          aria-hidden
                        />
                      ) : st === "failed" ? (
                        <X className="h-3.5 w-3.5" aria-hidden />
                      ) : null}
                      0{i + 1} <span className="sr-only">{st}</span>
                    </div>
                    <div className="relative mt-1 font-medium">{s}</div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="surface animate-rise mt-6 flex items-start gap-3 border-risk-high/30 p-5"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-risk-high" aria-hidden />
          <div className="flex-1">
            <div className="font-semibold">{errorTitle(error.code)}</div>
            <div className="mt-1 text-sm text-muted-foreground">{error.message}</div>
          </div>
          {error.code === "GOOGLE_API_NOT_CONFIGURED" && (
            <Button size="sm" variant="outline" asChild>
              <Link to="/settings">Configure API</Link>
            </Button>
          )}
          {background && (
            <p role="status" className="surface mt-6 p-5">
              {phase === "queued" ? "Scan queued" : "Processing..."} · ID: {scanId}. Background
              progress is saved; reopening this browser resumes tracking.
            </p>
          )}
        </div>
      )}

      {scanId && phase !== "fetch" && <ScanResult id={scanId} />}
    </>
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
      } as Record<string, string>
    )[code] ?? "Scan failed"
  );
}

function ScanResult({ id }: { id: string }) {
  const { data } = useQuery(scanQuery(id));
  if (!data?.scan?.business_name) return null;
  return (
    <div className="mt-8">
      <BusinessHeader scan={data.scan} />
      <RatingAnalysis scan={data.scan} reviews={data.reviews} />
      <RemovalSummary metadata={data.report?.report_data} total={data.reviews.length} />
      <ReviewSelection key={id} scan={data.scan} reviews={data.reviews} report={data.report} />
      <LegalAnalysisPanel scan={data.scan} reviews={data.reviews} report={data.report} />
      <RiskAnalysis scan={data.scan} reviews={data.reviews} />
    </div>
  );
}
