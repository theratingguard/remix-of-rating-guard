import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, ExternalLink, FileText, Info } from "lucide-react";
import type { AnalyzedReview, Scan } from "@/lib/data";
import { Stars, ReviewCard, ReviewDrawer, SeedBadge, ratingTone } from "./review-ui";
import { Button } from "@/components/ui/button";

export function BusinessHeader({ scan }: { scan: Scan }) {
  const rating = scan.rating != null ? Number(scan.rating) : null;
  return (
    <div className="surface animate-rise overflow-hidden">
      <div className="bg-scanner h-2" />
      <div className="flex flex-wrap items-center justify-between gap-6 p-6">
        <div className="space-y-2">
          {scan.is_seed && <SeedBadge />}
          <h2 className="text-2xl font-bold tracking-tight">{scan.business_name}</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {scan.category && <span>{scan.category}</span>}
            {scan.address && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden />{scan.address}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <div className="text-right">
            <div className="flex items-center justify-end gap-2">
              <span className={`font-mono text-4xl font-semibold tabular ${rating != null ? ratingTone(rating) : ""}`}>{rating?.toFixed(1) ?? "—"}</span>
              {rating != null && <Stars value={rating} size={18} />}
            </div>
            <div className="text-sm text-muted-foreground">{scan.total_reviews?.toLocaleString() ?? "—"} Google reviews</div>
          </div>
          {scan.maps_uri && !scan.is_seed && (
            <Button variant="outline" asChild><a href={scan.maps_uri} target="_blank" rel="noreferrer"><ExternalLink /> Open Google Maps</a></Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function RatingAnalysis({ scan, reviews }: { scan: Scan; reviews: AnalyzedReview[] }) {
  const rating = scan.rating != null ? Number(scan.rating) : null;
  const retrieved = [5, 4, 3, 2, 1].map((s) => ({ s, n: reviews.filter((r) => r.rating === s).length }));
  const max = Math.max(1, ...retrieved.map((x) => x.n));
  return (
    <section className="surface mt-6 grid gap-6 p-6 md:grid-cols-[220px_1fr]">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Overall rating</h2>
        <div className={`mt-2 font-mono text-5xl font-semibold ${rating != null ? ratingTone(rating) : ""}`}>{rating?.toFixed(1) ?? "—"}</div>
        {rating != null && <Stars value={rating} size={16} />}
        <div className="mt-1 text-sm text-muted-foreground">{scan.total_reviews?.toLocaleString() ?? "—"} total Google reviews</div>
      </div>
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ratings of retrieved reviews ({reviews.length})</h2>
        <div className="mt-3 space-y-2">
          {retrieved.map(({ s, n }) => (
            <div key={s} className="flex items-center gap-3 text-sm">
              <span className="w-12 font-mono">{s} star</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className={`h-full transition-all duration-1000 ${s >= 4 ? "bg-risk-normal" : s === 3 ? "bg-risk-medium" : "bg-risk-high"}`} style={{ width: `${(n / max) * 100}%` }} />
              </div>
              <span className="w-6 text-right font-mono">{n}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />Google's full rating distribution is not provided by the Places API. Bars show only the reviews retrieved in this scan.</p>
      </div>
    </section>
  );
}

export function RiskAnalysis({ scan, reviews, showReportLink = true }: { scan: Scan; reviews: AnalyzedReview[]; showReportLink?: boolean }) {
  const [open, setOpen] = useState<AnalyzedReview | null>(null);
  const tiles = [
    { label: "High risk", desc: "Potentially policy-risk reviews.", v: scan.high_count, cls: "bg-risk-high-soft text-risk-high" },
    { label: "Medium risk", desc: "Reviews with some risk signals.", v: scan.medium_count, cls: "bg-risk-medium-soft text-risk-medium" },
    { label: "Requires review", desc: "Ambiguous — needs a human look.", v: scan.requires_review_count, cls: "bg-brand-soft text-brand" },
    { label: "Normal", desc: "No significant risk detected.", v: scan.normal_count, cls: "bg-risk-normal-soft text-risk-normal" },
  ];
  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Available reviews</h2>
          <p className="text-sm text-muted-foreground">{scan.reviews_retrieved} retrieved · {reviews.filter((r) => r.analysis).length} analyzed</p>
        </div>
        {showReportLink && scan.status === "complete" && <Button variant="outline" asChild><Link to="/reports/$id" params={{ id: scan.id }}><FileText /> Generate report</Link></Button>}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className={`rounded-xl p-5 ${t.cls}`}>
            <div className="text-xs font-bold uppercase tracking-wider">{t.label}</div>
            <div className="mt-1 font-mono text-3xl font-semibold">{t.v}</div>
            <div className="mt-1 text-sm opacity-80">{t.desc}</div>
          </div>
        ))}
      </div>
      {!scan.is_seed && (
        <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Google's official Places API returns up to 5 reviews per business. These are the available reviews — not all Google reviews.
        </p>
      )}
      {reviews.length === 0 ? (
        <div className="surface mt-6 p-10 text-center text-muted-foreground">No available reviews were returned for this business.</div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {reviews.map((r) => <ReviewCard key={r.id} review={r} isSeed={scan.is_seed} onOpen={() => setOpen(r)} />)}
        </div>
      )}
      <ReviewDrawer review={open} scan={scan} onClose={() => setOpen(null)} />
    </section>
  );
}
