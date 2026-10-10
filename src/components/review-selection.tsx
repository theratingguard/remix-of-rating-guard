import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Scan, Report, AnalyzedReview } from "@/lib/data";
import { isFlagged } from "@/lib/data";
import { generateSelectedReport } from "@/lib/review-selection.functions";
import {
  reviewGoogleLink,
  selectionOutputSchema,
  selectedPdfUrl,
  type SelectionRequest,
} from "@/lib/review-selection";
import { Button } from "@/components/ui/button";
import { RemovalBadge } from "./removal-summary";
import { PrivatePdfButton } from "./private-pdf-button";

export function ReviewSelection({
  scan,
  reviews,
  report,
}: {
  scan: Scan;
  reviews: AnalyzedReview[];
  report: Report | null;
}) {
  const [selected, setSelected] = useState(
    () => new Set(reviews.filter((review) => review.user_selected).map((review) => review.id)),
  );
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const generate = useServerFn(generateSelectedReport);
  const queryClient = useQueryClient();
  const metadata = report?.report_data;
  const object =
    metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  const parsed = selectionOutputSchema.safeParse({ requests: object["selected_requests"] });
  const [requests, setRequests] = useState<SelectionRequest[]>(
    parsed.success ? parsed.data.requests : [],
  );
  const [pdfUrl, setPdfUrl] = useState(selectedPdfUrl(metadata));
  const visible = reviews.filter(
    (review) =>
      filter === "all" ||
      (filter === "1" && review.rating === 1) ||
      (filter === "2" && review.rating === 2) ||
      (filter === "flagged" && isFlagged(review)) ||
      (filter === "selected" && selected.has(review.id)),
  );
  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function reportSelected() {
    if (busy || selected.size === 0) return;
    setBusy(true);
    try {
      const result = await generate({ data: { scanId: scan.id, reviewIds: [...selected] } });
      setRequests(result.requests);
      setPdfUrl(result.url);
      await queryClient.invalidateQueries({ queryKey: ["scan", scan.id] });
      toast.success(
        `Selected report ready: ${result.selectedCount} reviews assessed. Nothing submitted to Google.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate selected report.");
    } finally {
      setBusy(false);
    }
  }
  if (scan.is_seed || scan.status !== "complete") return null;
  return (
    <section className="surface no-print my-6 p-5">
      <h2 className="text-lg font-bold">Choose reviews to assess for reporting</h2>
      <p className="my-2 text-sm text-muted-foreground">
        Select from the {reviews.length} available API reviews. Selection or a low rating does not
        establish a violation. Only supported policy concerns receive a request draft; other reviews
        receive an insufficient-evidence assessment.
      </p>
      <div className="my-3 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => setSelected(new Set(reviews.map((review) => review.id)))}
        >
          Select All
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            setSelected(
              new Set(reviews.filter((review) => review.rating === 1).map((review) => review.id)),
            )
          }
        >
          Select 1-star only
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => setSelected(new Set())}>
          Clear All
        </Button>
        <label>
          Filter reviews{" "}
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="rounded border p-2"
          >
            <option value="all">All reviews</option>
            <option value="1">1-star only</option>
            <option value="2">2-star only</option>
            <option value="flagged">Flagged by AI</option>
            <option value="selected">Manual select</option>
          </select>
        </label>
        <span role="status">{selected.size} reviews selected</span>
        <Button disabled={busy || selected.size === 0} onClick={reportSelected}>
          {busy ? "Generating selected requests and PDF..." : "Report Selected to Google"}
        </Button>
      </div>
      <div className="space-y-3">
        {visible.map((review) => {
          const link = reviewGoogleLink(review, scan.business_name || "Business", scan.maps_uri);
          return (
            <article key={review.id} className="rounded border p-4">
              <label className="flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  aria-label={`Select review by ${review.author}`}
                  checked={selected.has(review.id)}
                  disabled={busy}
                  onChange={() => toggle(review.id)}
                />
                {review.rating}/5 · {review.author}
              </label>
              <RemovalBadge item={review.legal} />
              <p className="my-2 whitespace-pre-wrap">
                {review.text || "Rating only; no review comment."}
              </p>
              <p className="text-sm">
                Policy assessment:{" "}
                {review.analysis?.category || "No substantiated policy violation"} · Risk:{" "}
                {review.analysis?.risk || "requires_review"} · AI confidence:{" "}
                {review.analysis?.confidence ?? 0}%
              </p>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand underline"
              >
                {link.label}
              </a>
              <Button variant="ghost" disabled={busy} onClick={() => toggle(review.id)}>
                {selected.has(review.id) ? "Deselect" : "Select"}
              </Button>
            </article>
          );
        })}
      </div>
      {pdfUrl && requests.length > 0 && (
        <div className="mt-5 border-t pt-4">
          <h3 className="font-bold">Saved selected report: {requests.length} reviews</h3>
          <PrivatePdfButton scanId={scan.id} variant="selected">
            Save Selected PDF
          </PrivatePdfButton>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `https://ratingguard.online/reports/${scan.id}`,
                );
                toast.success("Private report link copied. Authorized login required.");
              } catch (error) {
                console.error("[review-selection] Clipboard failed", error);
                toast.error("Could not copy the selected PDF URL.");
              }
            }}
          >
            Copy Selected Link
          </Button>
          <Button variant="outline" asChild>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Your Rating Guard selected review report (authorized login required): https://ratingguard.online/reports/${scan.id}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp Selected PDF
            </a>
          </Button>
          <p className="text-sm">
            This saved snapshot may differ from your current checkbox selection. Generate again to
            update it.
          </p>
          {requests.map((request) => (
            <article key={request.review_id} className="my-3 rounded border p-4">
              <h4 className="font-semibold">
                {reviews.find((review) => review.id === request.review_id)?.author} ·{" "}
                {request.assessment === "supported_policy_concern"
                  ? "Policy concern draft"
                  : "Insufficient evidence for removal"}
              </h4>
              <p>{request.policy}</p>
              <p className="my-2 whitespace-pre-wrap">{request.request_text}</p>
              {request.evidence && <p>Evidence: {request.evidence}</p>}
              <a
                href={request.policy_reference}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand underline"
              >
                Google policy reference
              </a>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(request.request_text);
                    toast.success("Request copied.");
                  } catch (error) {
                    console.error("[review-selection] Clipboard failed", error);
                    toast.error("Could not copy request. Select the displayed text manually.");
                  }
                }}
              >
                Copy Request
              </Button>
              <Button variant="outline" asChild>
                <a
                  href={
                    reviewGoogleLink(
                      reviews.find((review) => review.id === request.review_id) ?? {
                        author: "Reviewer",
                        review_uri: null,
                      },
                      scan.business_name || "Business",
                      scan.maps_uri,
                    ).url
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Report Google
                </a>
              </Button>
            </article>
          ))}
          <p className="text-sm">
            Review the evidence, open Google, locate the exact review, choose the reporting tool,
            and submit manually only if supported by policy. Nothing is submitted by Rating Guard.
          </p>
        </div>
      )}
    </section>
  );
}
