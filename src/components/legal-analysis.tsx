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

export function LegalAnalysisPanel({
  scan,
  report,
  reviews,
}: {
  scan: Scan;
  report: Report | null;
  reviews: AnalyzedReview[];
}) {
  const generate = useServerFn(saveReportPdf);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState("");
  const legal = savedLegalAnalysis(report?.report_data);
  const url = savedLegalPdfUrl(report?.report_data);
  if (scan.is_seed || scan.status !== "complete") return null;
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
      <div className="no-print flex flex-wrap gap-2">
        {!url && (
          <Button disabled={busy} onClick={prepare}>
            {busy ? "Generating legal analysis and PDFs..." : "Generate Legal Expert Analysis"}
          </Button>
        )}
        {url && (
          <Button variant="outline" asChild>
            <a
              href={`${url}?download=legal-v1`}
              download={`RPT-${scan.id.slice(0, 8).toUpperCase()}-legal.pdf`}
            >
              Download Legal Removal Request
            </a>
          </Button>
        )}
        <Button variant="outline" asChild>
          <a
            href={scan.maps_uri?.trim() || "https://support.google.com/business/answer/4596773"}
            target="_blank"
            rel="noopener noreferrer"
          >
            Report Google
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
