import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function StaffActivityReviewPage() {
  const client = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const activity = useQuery({
    queryKey: ["staff-activity-review"],
    queryFn: async () => {
      const [{ data: auth, error: authError }, { data: access, error: accessError }] =
        await Promise.all([supabase.auth.getUser(), supabase.rpc("report_access_level")]);
      if (authError) throw new Error(`Could not verify your session: ${authError.message}`);
      if (accessError) throw new Error(`Could not verify access: ${accessError.message}`);
      if (!auth.user) throw new Error("Sign in to review staff activity.");
      const [logs, staff, todayLogs] = await Promise.all([
        supabase
          .from("communication_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase.from("staff").select("id,name").order("name").limit(1000),
        (async () => {
          const startOfDay = new Date();
          startOfDay.setHours(0, 0, 0, 0);
          const rows = [];
          for (let offset = 0; ; offset += 500) {
            const { data, error } = await supabase
              .from("communication_log")
              .select("id,staff_id,log_type,created_at")
              .gte("created_at", startOfDay.toISOString())
              .order("created_at")
              .range(offset, offset + 499);
            if (error) throw new Error(`Could not load today's activity totals: ${error.message}`);
            rows.push(...data);
            if (data.length < 500) return rows;
            if (rows.length >= 50_000)
              throw new Error(
                "Today's activity exceeds 50,000 records; narrow the time range to get exact totals.",
              );
          }
        })(),
      ]);
      if (logs.error) throw new Error(`Could not load activity logs: ${logs.error.message}`);
      if (staff.error) throw new Error(`Could not load staff names: ${staff.error.message}`);
      const logIds = logs.data.map((item) => item.id);
      const evidence = logIds.length
        ? await supabase
            .from("communication_evidence")
            .select("*")
            .in("communication_log_id", logIds)
        : { data: [], error: null };
      if (evidence.error)
        throw new Error(`Could not load activity evidence: ${evidence.error.message}`);
      const files = await Promise.all(
        evidence.data.map(async (item) => {
          const { data, error } = await supabase.storage
            .from("evidence")
            .createSignedUrl(item.file_url, 300);
          if (error) throw new Error(`Could not open ${item.file_name}: ${error.message}`);
          return { ...item, signedUrl: data.signedUrl };
        }),
      );
      return {
        userId: auth.user.id,
        access,
        logs: logs.data,
        staff: staff.data,
        evidence: files,
        todayLogs,
      };
    },
  });

  async function updateLog(
    logId: string,
    change: {
      verified_by: string | null;
      verified_at: string | null;
      investigation_flag: boolean;
      investigation_note: string | null;
    },
  ) {
    setBusyId(logId);
    try {
      const { error } = await supabase.from("communication_log").update(change).eq("id", logId);
      if (error) throw new Error(error.message);
      await client.invalidateQueries({ queryKey: ["staff-activity-review"] });
      toast.success(change.investigation_flag ? "Investigation flag saved." : "Activity verified.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update activity.");
    } finally {
      setBusyId(null);
    }
  }

  if (activity.isLoading) return <p>Loading staff activity…</p>;
  if (activity.error || !activity.data)
    return <p role="alert">Could not load staff activity: {activity.error?.message}</p>;
  const canReview =
    activity.data.access === "super_admin" ||
    activity.data.staff.some((item) => item.id !== activity.data!.userId);
  if (!canReview) return <p role="alert">You are not authorized to review staff activity.</p>;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todayLogs = activity.data.todayLogs;
  const counts = activity.data.staff
    .filter((item) => item.id !== activity.data!.userId || activity.data!.access === "super_admin")
    .map((staffItem) => {
      const staffId = staffItem.id;
      const ownToday = todayLogs.filter((item) => item.staff_id === staffId);
      return {
        id: staffId,
        name: staffItem.name,
        calls: ownToday.filter((item) => item.log_type === "call").length,
        messages: ownToday.filter((item) => item.log_type === "whatsapp").length,
        emails: ownToday.filter((item) => item.log_type === "email").length,
      };
    });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Staff Activity"
        subtitle="Review manually entered calls, WhatsApp and email logs; verify records or flag concerns."
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {counts.map((item) => (
          <article className="surface p-4" key={item.id}>
            <h2 className="font-semibold">{item.name}</h2>
            <p className="mt-2 text-sm">
              Today: {item.calls} calls · {item.messages} messages · {item.emails} emails
            </p>
          </article>
        ))}
        {!counts.length && (
          <p className="surface p-4 text-sm text-muted-foreground">No activity records yet.</p>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Activity records</h2>
        {activity.data.logs.map((item) => (
          <article className="surface space-y-3 p-4" id={item.id} key={item.id}>
            <header className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">
                  {activity.data!.staff.find((staff) => staff.id === item.staff_id)?.name ??
                    "Staff"}{" "}
                  · {item.log_type}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {item.direction} · {item.outcome.replaceAll("_", " ")} ·{" "}
                  {new Date(item.created_at).toLocaleString()}
                </p>
              </div>
              <span className={item.verified_at ? "text-sm text-emerald-700" : "text-sm"}>
                {item.verified_at ? "Verified" : "Not verified"}
              </span>
            </header>
            <p className="whitespace-pre-wrap text-sm">{item.summary}</p>
            {item.contact_number && (
              <p className="text-xs text-muted-foreground">Contact number: {item.contact_number}</p>
            )}
            {item.contact_email && (
              <p className="text-xs text-muted-foreground">Contact email: {item.contact_email}</p>
            )}
            <div className="flex flex-wrap gap-3">
              {activity.data.evidence
                .filter((file) => file.communication_log_id === item.id)
                .map((file) => (
                  <a
                    className="text-sm text-primary underline"
                    href={file.signedUrl}
                    target="_blank"
                    rel="noreferrer"
                    key={file.id}
                  >
                    {file.file_name}
                  </a>
                ))}
            </div>
            {item.investigation_flag && (
              <p className="rounded-md border border-risk-high/40 bg-risk-high-soft p-3 text-sm">
                Investigate: {item.investigation_note}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busyId === item.id || Boolean(item.verified_at)}
                onClick={() =>
                  void updateLog(item.id, {
                    verified_by: activity.data!.userId,
                    verified_at: new Date().toISOString(),
                    investigation_flag: false,
                    investigation_note: null,
                  })
                }
              >
                {item.verified_at ? "Verified" : "Verify"}
              </Button>
              {!item.investigation_flag ? (
                <>
                  <Input
                    className="max-w-sm"
                    aria-label={`Investigation note for ${item.id}`}
                    placeholder="Reason for investigation"
                    maxLength={2000}
                    value={notes[item.id] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={busyId === item.id || !(notes[item.id] ?? "").trim()}
                    onClick={() =>
                      void updateLog(item.id, {
                        verified_by: null,
                        verified_at: null,
                        investigation_flag: true,
                        investigation_note: notes[item.id]!.trim(),
                      })
                    }
                  >
                    Investigate
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busyId === item.id}
                  onClick={() =>
                    void updateLog(item.id, {
                      verified_by: null,
                      verified_at: null,
                      investigation_flag: false,
                      investigation_note: null,
                    })
                  }
                >
                  Clear investigation
                </Button>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
