import { ReplyAssistant } from "@/components/reply-assistant";
import { Star, ExternalLink, Flag, ShieldAlert, ShieldCheck, ShieldQuestion, FlaskConical, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { GOOGLE_REPORT_URL, type AnalyzedReview, type Risk, type Scan, fmtDate, riskOf } from "@/lib/data";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star className="absolute inset-0 text-border" fill="currentColor" strokeWidth={0} style={{ width: size, height: size }} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className="text-star" fill="currentColor" strokeWidth={0} style={{ width: size, height: size }} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Rating tone: 4-5 positive, 3 neutral/warning, 1-2 negative. */
export const ratingTone = (r: number) => (r >= 4 ? "text-risk-normal" : r >= 3 ? "text-risk-medium" : "text-risk-high");

const riskMeta: Record<Risk, { label: string; cls: string; Icon: typeof ShieldAlert }> = {
  high: { label: "High risk", cls: "bg-risk-high-soft text-risk-high", Icon: ShieldAlert },
  medium: { label: "Medium risk", cls: "bg-risk-medium-soft text-risk-medium", Icon: ShieldQuestion },
  requires_review: { label: "Requires review", cls: "bg-brand-soft text-brand", Icon: Eye },
  normal: { label: "Normal", cls: "bg-risk-normal-soft text-risk-normal", Icon: ShieldCheck },
};

export function RiskBadge({ risk, className }: { risk: string; className?: string }) {
  const m = riskMeta[(risk in riskMeta ? risk : "requires_review") as Risk];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", m.cls, className)}>
      <m.Icon className="h-3.5 w-3.5" aria-hidden /> {m.label}
    </span>
  );
}

export function SeedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-risk-medium bg-risk-medium-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-risk-medium">
      <FlaskConical className="h-3 w-3" aria-hidden /> Development data — not live Google data
    </span>
  );
}

export function DevTag() {
  return <span className="ml-2 rounded bg-risk-medium-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-risk-medium">Dev data</span>;
}

export function ReviewCard({ review, onOpen, isSeed }: { review: AnalyzedReview; onOpen: () => void; isSeed?: boolean }) {
  const a = review.analysis;
  const risk = riskOf(review);
  return (
    <article className="surface surface-hover animate-rise flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand" aria-hidden>
            {review.author.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold">{review.author}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Stars value={review.rating} size={12} /> {review.relative_time ?? fmtDate(review.published_at)}
            </div>
          </div>
        </div>
        <RiskBadge risk={risk} />
      </div>
      <p className="mt-4 line-clamp-4 text-[15px] leading-relaxed">{review.text || <em className="text-muted-foreground">No review text</em>}</p>
      {a && risk !== "normal" && (
        <div className="mt-4 grid gap-3 rounded-lg bg-muted p-3 text-sm sm:grid-cols-[1fr_auto]">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{a.category ?? "Potential policy risk"}</div>
            <div className="mt-1">{a.reason}</div>
            {a.signals.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.signals.map((i) => <span key={i} className="rounded-md bg-card px-2 py-0.5 text-xs">{i}</span>)}
              </div>
            )}
          </div>
          <Confidence value={a.confidence} />
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <Button size="sm" variant="outline" onClick={onOpen}>View analysis</Button>
        {!isSeed && review.review_uri && (
          <Button size="sm" variant="ghost" asChild><a href={review.review_uri} target="_blank" rel="noreferrer"><ExternalLink /> View on Google</a></Button>
        )}
        {!isSeed && (risk === "high" || risk === "medium") && (
          <Button size="sm" variant="ghost" asChild><a href={GOOGLE_REPORT_URL} target="_blank" rel="noreferrer"><Flag /> Report for review</a></Button>
        )}
      </div>
    </article>
  );
}

export function Confidence({ value }: { value: number }) {
  return (
    <div className="text-right">
      <div className="text-xs text-muted-foreground">Confidence</div>
      <div className="font-mono text-2xl font-semibold tabular">{value}%</div>
      <div className="mt-1 ml-auto h-1.5 w-20 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-brand transition-all duration-700" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function ReviewDrawer({ review, scan, onClose }: { review: AnalyzedReview | null; scan: Scan | null; onClose: () => void }) {
  const a = review?.analysis;
  return (
    <Sheet open={!!review} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {review && (
          <>
            <SheetHeader>
              <SheetTitle className="text-xl">{review.author}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <Stars value={review.rating} /> <span>{review.relative_time ?? fmtDate(review.published_at)}</span> <RiskBadge risk={riskOf(review)} />
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-6 px-4 pb-8">
              {scan?.is_seed && <SeedBadge />}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Review text · original Google data</h3>
                <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">{review.text || "No review text available."}</p>
              </section>
              <section className="surface space-y-4 p-4">
                <h3 className="text-sm font-semibold">Analysis · AI-generated</h3>
                {a ? (
                  <>
                    <Field label="Risk category" value={a.category ?? "None detected"} />
                    <Field label="Reason" value={a.reason ?? "—"} />
                    <Field label="Detected signals" value={a.signals.length ? a.signals.join(" · ") : "None"} />
                    <Field label="Evidence" value={a.evidence ?? "—"} />
                    <Confidence value={a.confidence} />
                    <p className="text-xs text-muted-foreground">Automated assessment. It does not guarantee a policy violation. A negative review is not automatically a violation.</p>
                  </>
                ) : <p className="text-sm text-muted-foreground">Not analyzed yet.</p>}
              </section>
              {!scan?.is_seed && <ReplyAssistant reviewId={review.id} />}
              {!scan?.is_seed && (
                <div className="flex flex-col gap-2">
                  {(review.review_uri || scan?.maps_uri) && (
                    <Button variant="outline" asChild><a href={review.review_uri ?? scan!.maps_uri!} target="_blank" rel="noreferrer"><ExternalLink /> View review on Google</a></Button>
                  )}
                  <Button asChild><a href={GOOGLE_REPORT_URL} target="_blank" rel="noreferrer"><Flag /> Open Google reporting path</a></Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Google independently determines whether a review violates its policies and whether removal is appropriate.</p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}
