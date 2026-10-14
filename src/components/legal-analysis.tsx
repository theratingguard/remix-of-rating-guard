import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Scan, Report, AnalyzedReview } from "@/lib/data";
import {
  savedLegalAnalysis,
  savedLegalPdfUrl,
  LEGAL_DISCLAIMER,
  LEGAL_TEMPLATES,
} from "@/lib/legal-analysis";
import { saveReportPdf } from "@/lib/report-pdf.functions";
import { Button } from "@/components/ui/button";
import { RemovalBadge } from "./removal-summary";
import { PrivatePdfButton } from "./private-pdf-button";
import { ReviewQualityPanel } from "./review-quality";
import { RemovalSubmissionForm } from "./removal-workflow";
import { useFeatureSettings } from "@/lib/use-feature-settings";
import { RemovalPredictionPanel } from "./removal-prediction";

export function LegalAnalysisPanel({
  scan,
  report,
  reviews,
}: {
  scan: Scan;
  report: Report | null;
  reviews: AnalyzedReview[];
}) {
  const features = useFeatureSettings();
  const generate = useServerFn(saveReportPdf);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState("");
  const legal = savedLegalAnalysis(report?.report_data);
  const url = savedLegalPdfUrl(report?.report_data);
  if (scan.is_seed || scan.status !== "complete") return null;
  if (features.error)
    return <p role="alert">Could not load feature controls: {features.error.message}</p>;
  if (!features.data?.legal_expert_enabled)
    return <p>Legal Expert Mode disabled or loading Settings.</p>;
  async function prepare() {
    setBusy(true);
    try {
      await generate({ data: { scanId: scan.id } });
      await queryClient.invalidateQueries({ queryKey: ["scan", scan.id] });
      await queryClient.invalidateQueries({ queryKey: ["scans"] });
      toast.success("Legal policy assessment and PDFs saved. Nothing submitted to Google.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Legal analysis could not be generated.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Draft copied. Review facts before submitting.");
    } catch (error) {
      console.error("[legal-analysis] Copy failed", error);
      toast.error("Could not copy. Select the displayed text manually.");
    }
  }
  return (
    <section className="surface my-6 p-5">
      <h2 className="text-lg font-bold">Legal Expert Analysis</h2>
      <p className="my-2 text-sm text-muted-foreground">{LEGAL_DISCLAIMER}</p>
      <p className="my-2 text-sm">
        Legal drafting provider: {legal?.model ?? "Not generated"}. Risk-assessment votes use only
        providers enabled in Settings. This section does not claim Claude/Gemini legal drafting.
      </p>
      <div className="no-print flex flex-wrap gap-2">
        {(!url || legal?.reviews.some((item) => !item.quality || !item.prediction)) && (
          <Button disabled={busy || !features.data.gpt_enabled} onClick={prepare}>
            {busy
              ? "Generating legal analysis and PDFs..."
              : "Generate / Upgrade Legal Expert Analysis"}
          </Button>
        )}
        {url && (
          <PrivatePdfButton scanId={scan.id} variant="legal">
            Preview Legal Removal Request
          </PrivatePdfButton>
        )}
        <Button variant="outline" asChild>
          <a
            href={scan.maps_uri?.trim() || scan.source_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open business in Google Maps
          </a>
        </Button>
      </div>
      {!legal && (
        <p className="mt-3 text-sm">
          Legal Expert Mode has not been generated for this older report. Generate it to update the
          saved PDF.
        </p>
      )}
      {legal && (
        <>
          <p className="my-3 text-xs text-muted-foreground">
            Generated: {new Date(legal.generated_at).toLocaleString()} · {legal.model}
          </p>
          {legal.outcome_context?.length ? (
            <ul className="my-2 list-disc pl-5">
              {legal.outcome_context.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">
              Insufficient decided outcomes for strategy feedback. No model retraining claimed.
            </p>
          )}
          {legal.reviews.map((item) => (
            <article key={item.review_id} className="my-3 rounded border p-4">
              <RemovalBadge item={item} />
              <h3 className="font-semibold">
                {reviews.find((review) => review.id === item.review_id)?.author || item.review_id}
              </h3>
              <p>
                {item.violates_policy
                  ? "Potential supported policy concern; Google decides"
                  : "No substantiated policy violation"}
              </p>
              <p>
                Policy citation: {item.policy_type} / {item.policy_section} ·{" "}
                <a
                  className="text-brand underline"
                  href={item.policy_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Official policy
                </a>
              </p>
              <p className="whitespace-pre-wrap">
                Evidence quote: {item.evidence_quote || "No supported policy evidence"}
              </p>
              <p className="my-2 text-sm">Legal grounds: {item.legal_grounds}</p>
              <p className="font-semibold">
                Removal likelihood:{" "}
                {item.violates_policy
                  ? `${item.removal_likelihood}% — uncalibrated AI estimate, not verified probability`
                  : "Not estimable (0 score; insufficient evidence)"}
              </p>
              <p className="my-2">{item.reasoning}</p>
              {item.quality && <ReviewQualityPanel quality={item.quality} />}
              <RemovalPredictionPanel prediction={item.prediction} />
              {item.supporting_docs.length > 0 && (
                <div>
                  <h4>Supporting documents to obtain (not supplied)</h4>
                  <ul className="list-disc pl-5">
                    {item.supporting_docs.map((doc) => (
                      <li key={doc}>{doc}</li>
                    ))}
                  </ul>
                </div>
              )}
              {item.removal_request_text ? (
                <>
                  <p className="my-3 whitespace-pre-wrap">{item.removal_request_text}</p>
                  <Button
                    className="no-print"
                    variant="outline"
                    onClick={() => copy(item.removal_request_text)}
                  >
                    Copy Legal Removal Request
                  </Button>
                </>
              ) : (
                <p>No removal request drafted without supported evidence.</p>
              )}
              {features.data.appeal_tracking_enabled &&
                reviews.find((review) => review.id === item.review_id) && (
                  <RemovalSubmissionForm
                    scan={scan}
                    legal={item}
                    review={reviews.find((review) => review.id === item.review_id)!}
                  />
                )}
            </article>
          ))}
        </>
      )}
      <details className="no-print mt-4">
        <summary className="cursor-pointer font-semibold">
          Policy request templates (fill verified facts; not ready-to-submit evidence)
        </summary>
        <div className="my-3 flex flex-wrap gap-2">
          {LEGAL_TEMPLATES.map((item) => (
            <Button key={item.key} variant="outline" onClick={() => setTemplate(item.text)}>
              {item.name}
            </Button>
          ))}
        </div>
        {template && (
          <>
            <textarea
              aria-label="Editable legal policy template"
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
              className="h-72 w-full rounded border bg-transparent p-3"
            />
            <Button variant="outline" onClick={() => copy(template)}>
              Copy Edited Template
            </Button>
          </>
        )}
      </details>
    </section>
  );
}
