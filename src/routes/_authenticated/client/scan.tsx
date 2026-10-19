import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, Check, LoaderCircle, ScanLine, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { prepareClientReport } from "@/lib/client-portal.functions";
import { clientScanQuery } from "@/lib/client-portal";
import { scanAnalyze, scanFetch } from "@/lib/scan.functions";
import { isGoogleMapsUrl } from "@/lib/google-url";

export const Route = createFileRoute("/_authenticated/client/scan")({
  component: ClientScanPage,
});

type ScanPhase = "idle" | "fetching" | "analyzing" | "done" | "error";

function ClientScanPage() {
  const [url, setUrl] = useState("");
  const [scanId, setScanId] = useState("");
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [errorStep, setErrorStep] = useState(1);
  const [errorMessage, setErrorMessage] = useState("");
  const [preparingReviewId, setPreparingReviewId] = useState("");
  const queryClient = useQueryClient();
  const fetchScan = useServerFn(scanFetch);
  const analyzeScan = useServerFn(scanAnalyze);
  const prepareReport = useServerFn(prepareClientReport);
  const scanQuery = useQuery({
    ...clientScanQuery(scanId),
    refetchInterval: phase === "fetching" || phase === "analyzing" ? 1800 : false,
  });

  useEffect(() => {
    const scan = scanQuery.data?.scan;
    if (!scan || (phase !== "fetching" && phase !== "analyzing")) return;
    if (scan.status === "complete") {
      setPhase("done");
      void queryClient.invalidateQueries({ queryKey: ["client-portal", "dashboard"] });
    } else if (scan.status === "failed") {
      setErrorStep(scan.stage === "analyze" || scan.stage === "legal" ? 2 : 1);
      setPhase("error");
      setErrorMessage("The scan could not be completed. Please try again.");
    } else if (scan.stage === "analyze" || scan.stage === "legal") {
      setPhase("analyzing");
    }
  }, [phase, queryClient, scanQuery.data]);

  async function startScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setErrorStep(1);
    if (!isGoogleMapsUrl(url.trim())) {
      setErrorMessage("Enter a valid Google Maps business or review URL.");
      return;
    }
    setPhase("fetching");
    setScanId("");
    let requestStage: "fetch" | "analyze" = "fetch";
    try {
      const fetched = await fetchScan({ data: { url: url.trim() } });
      if (!fetched.ok) {
        setErrorStep(1);
        setPhase("error");
        setErrorMessage(
          fetched.code === "INVALID_URL"
            ? "Enter a valid Google Maps URL."
            : fetched.code === "QUEUE_UNAVAILABLE"
              ? "Scanning is temporarily unavailable. Please try again shortly."
              : "We could not retrieve reviews for this link. Check the URL and try again.",
        );
        return;
      }
      setScanId(fetched.scanId);
      if (fetched.queued) {
        setPhase("fetching");
        return;
      }
      setPhase("analyzing");
      requestStage = "analyze";
      const analyzed = await analyzeScan({ data: { scanId: fetched.scanId } });
      if (!analyzed.ok) {
        setErrorStep(2);
        setPhase("error");
        setErrorMessage("Review analysis could not be completed. Please try again.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["client-portal", "scan", fetched.scanId] });
      setPhase("done");
      void queryClient.invalidateQueries({ queryKey: ["client-portal", "dashboard"] });
      toast.success("Scan complete. Review the flagged items below.");
    } catch {
      setErrorStep(requestStage === "analyze" ? 2 : 1);
      setPhase("error");
      setErrorMessage("A connection issue stopped the scan. Please try again.");
    }
  }

  async function prepare(reviewId: string) {
    setPreparingReviewId(reviewId);
    try {
      await prepareReport({ data: { reviewId } });
      toast.success("Report draft saved as pending. It has not been submitted to Google.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-portal", "scan", scanId] }),
        queryClient.invalidateQueries({ queryKey: ["client-portal", "reports"] }),
        queryClient.invalidateQueries({ queryKey: ["client-portal", "dashboard"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare this report.");
    } finally {
      setPreparingReviewId("");
    }
  }

  const step =
    phase === "idle"
      ? 0
      : phase === "fetching"
        ? 1
        : phase === "analyzing"
          ? 2
          : phase === "error"
            ? errorStep
            : 3;
  const flaggedReviews = (scanQuery.data?.reviews ?? []).filter(
    (review) => review.rating <= 2 && review.rating >= 1,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <div>
        <p className="text-sm font-medium text-primary">Scan & review</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Find review issues</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Enter a Google Maps business or review link. We’ll assess available reviews for potential
          policy concerns.
        </p>
      </div>

      <Card className="hover:translate-y-0">
        <CardContent className="p-5 sm:p-7">
          <form onSubmit={(event) => void startScan(event)} className="space-y-4">
            <label htmlFor="maps-url" className="text-sm font-medium">
              Google Maps URL
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                id="maps-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://maps.google.com/…"
                autoComplete="url"
                required
                aria-describedby="maps-url-help"
                className="h-11 min-w-0"
              />
              <Button type="submit" size="lg" disabled={step > 0 && step < 3}>
                {step > 0 && step < 3 ? (
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                ) : (
                  <ScanLine className="mr-2 size-4" />
                )}
                Start scan
              </Button>
            </div>
            <p id="maps-url-help" className="text-xs text-muted-foreground">
              Only public Google Maps business or review links are supported.
            </p>
          </form>
        </CardContent>
      </Card>

      {step > 0 && (
        <Card className="hover:translate-y-0">
          <CardContent className="space-y-5 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold">Scan progress</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {phase === "done"
                    ? "Your review assessment is ready."
                    : phase === "error"
                      ? "The scan stopped before completion."
                      : "This may take a few minutes while reviews are assessed."}
                </p>
              </div>
              {phase === "done" ? (
                <Check className="size-5 text-emerald-600" />
              ) : phase === "error" ? (
                <AlertCircle className="size-5 text-destructive" />
              ) : (
                <LoaderCircle className="size-5 animate-spin text-primary" />
              )}
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={3}
              aria-valuenow={phase === "error" ? Math.max(0, step - 1) : step}
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{
                  width: `${phase === "error" ? Math.max(6, ((step - 1) / 3) * 100) : (step / 3) * 100}%`,
                }}
              />
            </div>
            <ol className="grid gap-3 text-xs sm:grid-cols-3 sm:text-sm">
              {["Fetching reviews", "AI analysis", "Done"].map((label, index) => {
                const active = phase !== "error" && index + 1 === step;
                const complete = phase === "done" || index + 1 < step;
                const failed = phase === "error" && index + 1 === step;
                return (
                  <li
                    key={label}
                    className={
                      complete
                        ? "font-medium text-emerald-700"
                        : failed
                          ? "font-medium text-destructive"
                          : active
                            ? "font-medium text-primary"
                            : "text-muted-foreground"
                    }
                  >
                    {complete ? "✓ " : failed ? "× " : `${index + 1}. `}
                    {label}
                  </li>
                );
              })}
            </ol>
            {phase === "error" && (
              <p role="alert" className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">
                {errorMessage}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {scanQuery.error && (
        <p role="alert" className="text-sm text-destructive">
          Scan results could not be loaded. Please refresh.
        </p>
      )}

      {phase === "done" && (
        <section className="space-y-4" aria-labelledby="flagged-reviews-heading">
          <div className="flex items-center justify-between">
            <div>
              <h2 id="flagged-reviews-heading" className="text-xl font-semibold">
                Flagged reviews
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Low ratings alone do not prove a policy violation; review each assessment carefully.
              </p>
            </div>
          </div>
          {flaggedReviews.length === 0 ? (
            <Card className="hover:translate-y-0">
              <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
                <ShieldAlert className="size-5 shrink-0" />
                No 1- or 2-star reviews were found in the available scan results.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {flaggedReviews.map((review) => {
                const risk = review.risk.toLowerCase();
                const color =
                  risk === "high"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : risk === "medium"
                      ? "border-orange-200 bg-orange-50 text-orange-800"
                      : "border-yellow-200 bg-yellow-50 text-yellow-900";
                const supported = ["high", "medium"].includes(risk) && Boolean(review.review_uri);
                const pending = review.action_status?.toUpperCase() === "PENDING";
                return (
                  <Card key={review.id} className="hover:translate-y-0">
                    <CardContent className="space-y-4 p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{review.rating} star</span>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${color}`}
                        >
                          {risk === "high"
                            ? "High concern"
                            : risk === "medium"
                              ? "Needs review"
                              : "Review"}
                        </span>
                        {review.policy_category && (
                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs">
                            {review.policy_category}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{review.author || "Google reviewer"}</p>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                          {review.text || "No review text was provided."}
                        </p>
                      </div>
                      {review.reason && (
                        <div className="rounded-lg bg-muted/60 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Assessment reason
                          </p>
                          <p className="mt-1 text-sm">{review.reason}</p>
                        </div>
                      )}
                      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Preparing a draft does not submit a report to Google. A person must review
                          and submit it through Google’s official process.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          className="shrink-0"
                          disabled={!supported || pending || preparingReviewId === review.id}
                          onClick={() => void prepare(review.id)}
                          title={
                            !supported
                              ? "This review does not have a validated reporting signal."
                              : undefined
                          }
                        >
                          {preparingReviewId === review.id && (
                            <LoaderCircle className="mr-2 size-4 animate-spin" />
                          )}
                          {pending ? "Draft pending" : "Prepare report"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
