import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AnalyzedReview, Scan } from "@/lib/data";
import { REVIEW_WORKFLOW_LABELS, type ReviewWorkflowStatus } from "@/lib/review-workflow";
import { Button } from "@/components/ui/button";

type ReviewAction = {
  status: string;
  note: string | null;
  user_id: string;
};

function isWorkflowStatus(value: string | undefined): value is ReviewWorkflowStatus {
  return value !== undefined && value in REVIEW_WORKFLOW_LABELS;
}

export function ReviewWorkflowCard({ scan, review }: { scan: Scan; review: AnalyzedReview }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [reply, setReply] = useState("");
  const [confirmingReportAgain, setConfirmingReportAgain] = useState(false);
  const query = useQuery({
    queryKey: ["review-workflow-action", scan.id, review.id],
    queryFn: async () => {
      const [{ data: action, error: actionError }, { data: auth, error: authError }] =
        await Promise.all([
          supabase
            .from("review_actions")
            .select("status,note,user_id")
            .eq("review_id", review.id)
            .maybeSingle(),
          supabase.auth.getUser(),
        ]);
      if (actionError) throw actionError;
      if (authError) throw authError;
      if (!auth.user) throw new Error("Sign in to view this review's workflow.");
      const actionRow = action as ReviewAction | null;
      const profile = actionRow
        ? await supabase
            .from("profiles")
            .select("name")
            .eq("user_id", actionRow.user_id)
            .maybeSingle()
            .throwOnError()
        : null;
      return {
        action: actionRow,
        reporter: profile?.data?.name || auth.user.email || "Signed-in user",
      };
    },
  });

  if (query.isPending) return <p className="text-sm text-muted-foreground">Loading workflow…</p>;
  if (query.error) return <p role="alert">Could not load review workflow: {query.error.message}</p>;

  const action = query.data.action;
  const status = action && isWorkflowStatus(action.status) ? action.status : null;
  const mapsUrl = review.review_uri ?? scan.maps_uri ?? scan.source_url;
  const replyValue = reply || action?.note || "";
  const reported = status !== null;
  const rescanAvailable =
    status === "REPORTED" || status === "REPLIED" || status === "REPORTED_AGAIN";

  async function save(nextStatus: ReviewWorkflowStatus, note = action?.note ?? null) {
    setSaving(true);
    let statusSaved = false;
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!data.user) throw new Error("Sign in before updating this review workflow.");
      await supabase
        .from("review_actions")
        .upsert(
          {
            review_id: review.id,
            scan_id: scan.id,
            user_id: data.user.id,
            status: nextStatus,
            note,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "review_id" },
        )
        .throwOnError();
      statusSaved = true;
      if (nextStatus === "REPORTED" || nextStatus === "REPORTED_AGAIN") {
        await supabase
          .from("audit_log")
          .insert({
            user_id: data.user.id,
            action: nextStatus === "REPORTED" ? "review.report_sent" : "review.report_again",
            resource: "review",
            resource_id: review.id,
            detail: { scan_id: scan.id, status: nextStatus },
          })
          .throwOnError();
      }
      await queryClient.invalidateQueries({
        queryKey: ["review-workflow-action", scan.id, review.id],
      });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-review-actions"] });
      toast.success(`Review status updated: ${REVIEW_WORKFLOW_LABELS[nextStatus]}.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error.";
      toast.error(
        statusSaved
          ? `Status saved, but report activity could not be counted: ${detail}`
          : `Could not update review status: ${detail}`,
      );
    } finally {
      setSaving(false);
    }
  }

  function openGoogleAndSetRescanning() {
    window.open(mapsUrl, "_blank", "noopener,noreferrer");
    void save("RESCANNING");
  }

  function openGoogleToReportAgain() {
    window.open(mapsUrl, "_blank", "noopener,noreferrer");
    setConfirmingReportAgain(true);
  }

  return (
    <section
      className="space-y-4 rounded-xl border bg-card p-4 text-left"
      aria-label={`Review workflow for ${review.author}`}
    >
      <div>
        <h3 className="font-semibold">Review Details</h3>
        <p className="mt-1 text-sm">
          <span className="font-medium">Reviewer:</span> {review.author || "Unknown"} ·{" "}
          <span className="font-medium">Rating:</span> {review.rating}/5
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
          {review.text || "No review text"}
        </p>
      </div>

      <div className="grid gap-1 text-sm sm:grid-cols-2">
        <p>
          <span className="font-medium">Reported By:</span>{" "}
          {reported ? query.data.reporter : "Not reported"}
        </p>
        <p>
          <span className="font-medium">Status:</span>{" "}
          {status ? REVIEW_WORKFLOW_LABELS[status] : "Not reported"}
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        Reporting, Google replies and removal checks are performed manually in Google. This app
        records your confirmed status; it does not submit reports or verify Google's moderation
        decision.
      </p>

      {!reported && (
        <div className="space-y-3">
          <Button variant="outline" asChild className="min-h-[48px] w-full text-base sm:w-auto">
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
              Open Google Maps to report
            </a>
          </Button>
          <Button
            type="button"
            variant="green"
            className="min-h-[48px] w-full text-base sm:w-auto"
            disabled={saving}
            onClick={() => void save("REPORTED")}
          >
            I submitted it — mark as Reported
          </Button>
        </div>
      )}

      {reported && status !== "REMOVED" && (
        <>
          <div className="space-y-2">
            <label htmlFor={`google-reply-${review.id}`} className="text-sm font-medium">
              Log Google Reply
            </label>
            <textarea
              id={`google-reply-${review.id}`}
              value={replyValue}
              onChange={(event) => setReply(event.target.value)}
              maxLength={4000}
              rows={3}
              className="min-h-[96px] w-full rounded-md border bg-background p-3 text-base"
              placeholder="Paste Google's reply"
            />
            <Button
              type="button"
              variant="outline"
              className="min-h-[48px] w-full text-base sm:w-auto"
              disabled={saving || replyValue.trim().length < 3}
              onClick={() => void save("REPLIED", replyValue.trim())}
            >
              Log Google Reply
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {rescanAvailable && (
              <Button
                type="button"
                variant="outline"
                className="min-h-[48px] w-full text-base"
                disabled={saving}
                onClick={openGoogleAndSetRescanning}
              >
                Rescan
              </Button>
            )}
            {status === "RESCANNING" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[48px] w-full text-base"
                  disabled={saving}
                  onClick={() => void save("INVESTIGATING")}
                >
                  Investigate
                </Button>
                <Button
                  type="button"
                  variant="green"
                  className="min-h-[48px] w-full text-base"
                  disabled={saving}
                  onClick={() => void save("REMOVED")}
                >
                  Mark as Removed
                </Button>
              </>
            )}
            {status === "INVESTIGATING" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[48px] w-full text-base"
                  disabled={saving}
                  onClick={openGoogleToReportAgain}
                >
                  Report Again
                </Button>
                <Button
                  type="button"
                  variant="green"
                  className="min-h-[48px] w-full text-base"
                  disabled={saving}
                  onClick={() => void save("REMOVED")}
                >
                  Mark as Removed
                </Button>
              </>
            )}
            {status === "REPORTED_AGAIN" && (
              <Button
                type="button"
                variant="outline"
                className="min-h-[48px] w-full text-base"
                disabled={saving}
                onClick={openGoogleAndSetRescanning}
              >
                Rescan
              </Button>
            )}
          </div>
          {confirmingReportAgain && status === "INVESTIGATING" && (
            <Button
              type="button"
              variant="green"
              className="min-h-[48px] w-full text-base sm:w-auto"
              disabled={saving}
              onClick={() => {
                setConfirmingReportAgain(false);
                void save("REPORTED_AGAIN");
              }}
            >
              I submitted it again — mark as Reported Again
            </Button>
          )}
        </>
      )}
      {status === "REMOVED" && (
        <p className="rounded-lg bg-risk-normal-soft p-3 font-semibold text-risk-normal">
          Success — removal manually confirmed.
        </p>
      )}
    </section>
  );
}
