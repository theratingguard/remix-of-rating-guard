import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
  const [orderBusy, setOrderBusy] = useState(false);
  const ordersQuery = useQuery({
    queryKey: ["review-removal-orders", scan.id],
    enabled: scan.status === "complete" && !scan.is_seed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("review_removal_orders")
        .select("id,review_id,status,price_cents,created_at")
        .eq("scan_id", scan.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
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
  async function requestRemoval() {
    const alreadyRequested = new Set((ordersQuery.data ?? []).map((order) => order.review_id));
    const reviewIds = [...selected].filter((id) => !alreadyRequested.has(id));
    if (orderBusy || reviewIds.length === 0 || reviewIds.length > 50) return;
    setOrderBusy(true);
    try {
      const { data, error } = await supabase.rpc("submit_review_removal_orders", {
        _scan_id: scan.id,
        _review_ids: reviewIds,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["review-removal-orders", scan.id] });
      toast.success(`${data} request(s) recorded. No payment was collected.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Removal requests could not be recorded.",
      );
    } finally {
      setOrderBusy(false);
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
          {busy
            ? "Generating selected requests and PDF..."
            : "Prepare reports for selected reviews"}
        </Button>
      </div>
      <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <h3 className="font-semibold">Optional review-removal service: $49 per review</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Requesting is free. Payment is due only after an administrator records a verified Google
          removal and independently confirms that payment was received. Google makes the final
          decision; Rating Guard does not submit or verify reviews automatically.
        </p>
        <Button
          className="mt-3"
          disabled={
            orderBusy ||
            ordersQuery.isPending ||
            Boolean(ordersQuery.error) ||
            selected.size === 0 ||
            selected.size > 50 ||
            [...selected].every((id) =>
              (ordersQuery.data ?? []).some((order) => order.review_id === id),
            )
          }
          onClick={() => void requestRemoval()}
        >
          {orderBusy
            ? "Submitting request…"
            : `Request removal for selected (${selected.size} × $49)`}
        </Button>
        {ordersQuery.error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            Existing removal requests could not be checked, so a new request is disabled.
          </p>
        )}
        {(ordersQuery.data ?? []).length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {ordersQuery.data?.map((order) => (
              <li key={order.id} className="flex flex-wrap justify-between gap-2">
                <span>Review …{order.review_id.slice(-8)}</span>
                <span className="capitalize">{order.status.replaceAll("_", " ")}</span>
              </li>
            ))}
          </ul>
        )}
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
            Preview Selected PDF
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
                  Open review in Google Maps
                </a>
              </Button>
            </article>
          ))}
          <p className="text-sm">
            Review the evidence, open the exact review in Google Maps, and use any available
            reporting option only if supported by policy. Google Places API does not submit reports;
            nothing is submitted by Rating Guard.
          </p>
        </div>
      )}
    </section>
  );
}
