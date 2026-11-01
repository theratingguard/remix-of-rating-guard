import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ClipboardList, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BroadcastComposer } from "@/components/broadcast-composer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  getHierarchyChildRole,
  getHierarchyRole,
  HIERARCHY_ROLE_LABELS,
} from "@/lib/management-hierarchy";

type DirectReport = {
  id: string;
  name: string;
  unique_id: string;
  role: string;
  status: string;
  tasks_assigned: number;
};

type DashboardData = {
  reports: DirectReport[];
  summary: {
    total_tasks: number;
    pending_tasks: number;
    in_progress_tasks: number;
    completed_tasks: number;
    rejected_tasks: number;
  };
  profile: { name: string; credits: number };
};

type NewMember = {
  name: string;
  email: string;
  mobileNumber: string;
  password: string;
};

type NewTask = {
  assigneeId: string;
  reviewUrl: string;
  title: string;
  description: string;
};

async function hierarchyApi<T>(path: string, init?: RequestInit): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Could not verify your session: ${error.message}`);
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to use hierarchy management.");

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers,
  });
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Hierarchy request returned an invalid response (${response.status}).`);
  }
  if (!response.ok) {
    const message =
      typeof result === "object" &&
      result !== null &&
      "error" in result &&
      typeof result.error === "string"
        ? result.error
        : "Hierarchy request failed.";
    throw new Error(message);
  }
  return result as T;
}

export function HierarchyDashboard({ routeRole }: { routeRole: string }) {
  const role = getHierarchyRole(routeRole);
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [assigningTo, setAssigningTo] = useState<string | null>(null);
  const dashboard = useQuery({
    queryKey: ["hierarchy-dashboard", role],
    enabled: role !== null,
    queryFn: () => hierarchyApi<DashboardData>("/api/hierarchy/get-team"),
  });
  const childRole = role ? getHierarchyChildRole(role) : null;

  if (!role) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        This hierarchy dashboard role is not recognized.
      </div>
    );
  }

  const profile = dashboard.data?.profile;
  const reports = dashboard.data?.reports ?? [];
  const summary = dashboard.data?.summary;

  async function submitMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!childRole) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const member: NewMember = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      mobileNumber: String(formData.get("mobileNumber") ?? ""),
      password: String(formData.get("password") ?? ""),
    };
    setBusy(true);
    try {
      await hierarchyApi("/api/hierarchy/add-member", {
        method: "POST",
        body: JSON.stringify(member),
      });
      form.reset();
      setAddOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["hierarchy-dashboard", role] });
      toast.success(`${HIERARCHY_ROLE_LABELS[childRole]} account created.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the direct report.");
    } finally {
      setBusy(false);
    }
  }

  async function submitTask(event: FormEvent<HTMLFormElement>, assigneeId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const task: NewTask = {
      assigneeId,
      reviewUrl: String(formData.get("reviewUrl") ?? ""),
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
    };
    setBusy(true);
    try {
      await hierarchyApi("/api/hierarchy/assign-task", {
        method: "POST",
        body: JSON.stringify(task),
      });
      form.reset();
      setAssigningTo(null);
      await queryClient.invalidateQueries({ queryKey: ["hierarchy-dashboard", role] });
      toast.success("Review task assigned.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not assign the review task.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Signed-in role
            </p>
            <h2 className="text-lg font-semibold">{HIERARCHY_ROLE_LABELS[role]}</h2>
            <p className="text-sm text-muted-foreground">
              This workspace is limited to your immediate direct reports.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-5">
            <h2 className="text-sm font-semibold">Workspace</h2>
            <p className="text-sm">{profile?.name ?? "Loading profile…"}</p>
            <p className="text-xs text-muted-foreground">
              {childRole
                ? `Can manage: ${HIERARCHY_ROLE_LABELS[childRole]}`
                : "No subordinate role"}
            </p>
            {role === "team_member" && (
              <Button asChild variant="outline" className="w-full">
                <Link to="/staff/tasks">My assigned tasks</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </aside>

      <main className="min-w-0 space-y-5">
        <PageHeader
          title={HIERARCHY_ROLE_LABELS[role]}
          subtitle="Manage the next level of the reporting chain and assign review work to direct reports."
          action={
            childRole ? (
              <Button onClick={() => setAddOpen((open) => !open)}>
                <UserPlus aria-hidden className="mr-2 size-4" />
                Add {HIERARCHY_ROLE_LABELS[childRole]}
              </Button>
            ) : undefined
          }
        />

        {role !== "team_member" && <BroadcastComposer />}

        {dashboard.isError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          >
            {dashboard.error.message}
          </p>
        )}

        {addOpen && childRole && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="font-semibold">Add {HIERARCHY_ROLE_LABELS[childRole]}</h2>
                <p className="text-sm text-muted-foreground">
                  The new account reports directly to you. Its role is selected by the server.
                </p>
              </div>
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={(event) => void submitMember(event)}
              >
                <div className="space-y-2">
                  <Label htmlFor="hierarchy-member-name">Full name</Label>
                  <Input
                    id="hierarchy-member-name"
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={120}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hierarchy-member-email">Email</Label>
                  <Input
                    id="hierarchy-member-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={320}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hierarchy-member-mobile">Mobile number</Label>
                  <Input
                    id="hierarchy-member-mobile"
                    name="mobileNumber"
                    type="tel"
                    required
                    minLength={6}
                    maxLength={32}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hierarchy-member-password">Temporary password</Label>
                  <Input
                    id="hierarchy-member-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                  />
                </div>
                <div className="flex gap-2 sm:col-span-2">
                  <Button type="submit" disabled={busy}>
                    {busy ? "Creating…" : `Create ${HIERARCHY_ROLE_LABELS[childRole]}`}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <section
          aria-label="Hierarchy summary"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <SummaryCard
            icon={<Users aria-hidden className="size-5 text-primary" />}
            label="Direct reports"
            value={dashboard.isPending ? "…" : reports.length}
          />
          <SummaryCard
            icon={<ClipboardList aria-hidden className="size-5 text-primary" />}
            label="Assigned tasks"
            value={dashboard.isPending ? "…" : (summary?.total_tasks ?? 0)}
          />
          <SummaryCard
            icon={<ClipboardList aria-hidden className="size-5 text-primary" />}
            label="In progress"
            value={dashboard.isPending ? "…" : (summary?.in_progress_tasks ?? 0)}
          />
          <SummaryCard
            icon={<ClipboardList aria-hidden className="size-5 text-primary" />}
            label="Completed"
            value={dashboard.isPending ? "…" : (summary?.completed_tasks ?? 0)}
          />
        </section>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div>
              <h2 className="font-semibold">Direct reports</h2>
              <p className="text-sm text-muted-foreground">
                Only active users in the next role below you are returned.
              </p>
            </div>
            {dashboard.isPending ? (
              <p className="text-sm text-muted-foreground">Loading your direct reports…</p>
            ) : reports.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {role === "team_member"
                  ? "Team Members have no subordinate role."
                  : "No active direct reports are assigned to this account."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-muted-foreground">
                      <th className="py-3 pr-4">Name</th>
                      <th className="py-3 pr-4">Unique ID</th>
                      <th className="py-3 pr-4">Role</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3 pr-4">Tasks assigned</th>
                      <th className="py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((member) => (
                      <tr className="border-b last:border-0" key={member.id}>
                        <td className="py-3 pr-4 font-medium">{member.name}</td>
                        <td className="py-3 pr-4 font-mono">{member.unique_id}</td>
                        <td className="py-3 pr-4">
                          {HIERARCHY_ROLE_LABELS[getHierarchyRole(member.role) ?? "team_member"]}
                        </td>
                        <td className="py-3 pr-4 capitalize">{member.status}</td>
                        <td className="py-3 pr-4">{member.tasks_assigned}</td>
                        <td className="py-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setAssigningTo(assigningTo === member.id ? null : member.id)
                            }
                          >
                            Assign review
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {assigningTo && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <h2 className="font-semibold">Assign a review URL</h2>
              <p className="text-sm text-muted-foreground">
                Assignment is restricted to the selected direct report. The review must already
                exist in Rating Guard.
              </p>
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={(event) => void submitTask(event, assigningTo)}
              >
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="hierarchy-task-url">Google review URL</Label>
                  <Input
                    id="hierarchy-task-url"
                    name="reviewUrl"
                    type="url"
                    required
                    maxLength={2048}
                    placeholder="https://www.google.com/maps/…"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="hierarchy-task-title">Task title</Label>
                  <Input
                    id="hierarchy-task-title"
                    name="title"
                    required
                    maxLength={160}
                    defaultValue="Review policy report"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="hierarchy-task-description">Instructions (optional)</Label>
                  <Textarea id="hierarchy-task-description" name="description" maxLength={5000} />
                </div>
                <div className="flex gap-2 sm:col-span-2">
                  <Button type="submit" disabled={busy}>
                    {busy ? "Assigning…" : "Assign task"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setAssigningTo(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <section hidden aria-label="Profile and wallet summary">
          <Card>
            <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
              <div>
                <h2 className="font-semibold">Profile</h2>
                <p>{profile?.name}</p>
              </div>
              <div>
                <h2 className="font-semibold">Wallet</h2>
                <p>{profile?.credits ?? 0} earned credits</p>
                <Link className="text-sm underline" to="/staff/wallet">
                  Open wallet
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        {icon}
        <div>
          <p className="text-xl font-semibold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
