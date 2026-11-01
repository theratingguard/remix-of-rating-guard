import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { toast } from "sonner";
import type { ZodType } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { broadcastOptionsSchema, broadcastResultSchema } from "@/lib/broadcast-schema";
import {
  HIERARCHY_ROLES,
  HIERARCHY_ROLE_LABELS,
  type HierarchyRole,
} from "@/lib/management-hierarchy";

type AudienceOptions = {
  teams: { id: string; label: string }[];
  roles: HierarchyRole[];
};
type BroadcastResult = {
  notifications_sent: number;
  active_recipients: number;
  inactive_recipients: number;
  tasks_created: number;
};
type Audience = "all_staff" | "specific_team" | "specific_role";
async function broadcastRequest<T>(
  method: "GET" | "POST",
  schema: ZodType<T>,
  body?: unknown,
): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Could not verify your session: ${error.message}`);
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to broadcast to staff.");

  const headers = new Headers({ Authorization: `Bearer ${token}` });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch("/api/broadcast", {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
  });
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Broadcast request returned an invalid response (${response.status}).`);
  }
  if (!response.ok) {
    const message =
      typeof result === "object" &&
      result !== null &&
      "error" in result &&
      typeof result.error === "string"
        ? result.error
        : "Broadcast request failed.";
    throw new Error(message);
  }
  return schema.parse(result);
}

export function BroadcastComposer() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState<Audience>("all_staff");
  const [teamId, setTeamId] = useState("");
  const [role, setRole] = useState<HierarchyRole | "">("");
  const [createTask, setCreateTask] = useState(false);
  const [busy, setBusy] = useState(false);
  const options = useQuery({
    queryKey: ["broadcast-audience-options"],
    queryFn: () => broadcastRequest<AudienceOptions>("GET", broadcastOptionsSchema),
    enabled: open,
    staleTime: 60_000,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy(true);
    try {
      const result = await broadcastRequest<BroadcastResult>("POST", broadcastResultSchema, {
        title: String(formData.get("title") ?? ""),
        message: String(formData.get("message") ?? ""),
        audience,
        ...(audience === "specific_team" ? { teamId } : {}),
        ...(audience === "specific_role" ? { role } : {}),
        createTask,
        reviewUrl: String(formData.get("reviewUrl") ?? ""),
      });
      await queryClient.invalidateQueries({ queryKey: ["global-notifications"] });
      toast.success(
        `Sent ${result.notifications_sent} notifications (${result.active_recipients} active, ${result.inactive_recipients} inactive)${result.tasks_created ? ` and assigned ${result.tasks_created} tasks` : ""}.`,
      );
      form.reset();
      setAudience("all_staff");
      setTeamId("");
      setRole("");
      setCreateTask(false);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Broadcast could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="hover:translate-y-0">
      <CardContent className="space-y-4 p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Broadcast to staff</h2>
            <p className="text-sm text-muted-foreground">
              Announcements reach active and inactive staff; tasks are assigned to active staff
              only.
            </p>
          </div>
          <Button type="button" onClick={() => setOpen((value) => !value)}>
            <Megaphone aria-hidden className="mr-2 size-4" />
            {open ? "Close broadcast" : "Broadcast Task / Message"}
          </Button>
        </div>
        {open && (
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
            {options.isError && (
              <p role="alert" className="text-sm text-destructive sm:col-span-2">
                Could not load broadcast audiences: {options.error.message}
              </p>
            )}
            {options.isPending && (
              <p className="text-sm text-muted-foreground sm:col-span-2">
                Loading authorized teams and roles…
              </p>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="broadcast-title">Title</Label>
              <Input id="broadcast-title" name="title" required maxLength={160} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="broadcast-message">Message / instructions</Label>
              <Textarea id="broadcast-message" name="message" required maxLength={5000} rows={4} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="broadcast-audience">Audience</Label>
              <select
                id="broadcast-audience"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={audience}
                onChange={(event) => {
                  const value = event.target.value;
                  if (
                    value === "all_staff" ||
                    value === "specific_team" ||
                    value === "specific_role"
                  ) {
                    setAudience(value);
                  }
                }}
              >
                <option value="all_staff">All Staff</option>
                <option value="specific_team">Specific Team</option>
                <option value="specific_role">Specific Role</option>
              </select>
            </div>
            {audience === "specific_team" && (
              <div className="space-y-2">
                <Label htmlFor="broadcast-team">Team</Label>
                <select
                  id="broadcast-team"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={teamId}
                  onChange={(event) => setTeamId(event.target.value)}
                  required
                  disabled={options.isPending || options.isError}
                >
                  <option value="">Select a team</option>
                  {(options.data?.teams ?? []).map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {audience === "specific_role" && (
              <div className="space-y-2">
                <Label htmlFor="broadcast-role">Role</Label>
                <select
                  id="broadcast-role"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={role}
                  onChange={(event) =>
                    setRole(HIERARCHY_ROLES.find((item) => item === event.target.value) ?? "")
                  }
                  required
                  disabled={options.isPending || options.isError}
                >
                  <option value="">Select a role</option>
                  {(options.data?.roles ?? []).map((item) => (
                    <option key={item} value={item}>
                      {HIERARCHY_ROLE_LABELS[item]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={createTask}
                onChange={(event) => setCreateTask(event.target.checked)}
              />
              Create an assigned task for each recipient
            </label>
            {createTask && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="broadcast-review-url">Google Review URL (optional)</Label>
                <Input
                  id="broadcast-review-url"
                  name="reviewUrl"
                  type="url"
                  maxLength={2048}
                  placeholder="https://www.google.com/maps/…"
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button
                type="submit"
                disabled={
                  busy ||
                  options.isPending ||
                  options.isError ||
                  (audience === "specific_team" && !teamId) ||
                  (audience === "specific_role" && !role)
                }
              >
                {busy ? "Sending…" : "Send broadcast"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
