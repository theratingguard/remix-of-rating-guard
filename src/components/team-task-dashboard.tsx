import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Staff = Tables<"staff">;
type Team = Tables<"teams">;
type Task = Tables<"tasks">;
type Earning = Tables<"team_task_earnings">;
type Mode = "manager" | "leader" | "staff" | "task-manager";

function money(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function useTeamData(mode: Mode) {
  return useQuery({
    queryKey: ["team-task-data", mode],
    queryFn: async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) throw new Error("Sign in to view team tasks.");
      const userId = auth.user.id;
      const [profileResult, accessResult] = await Promise.all([
        supabase.from("staff").select("*").eq("id", userId).maybeSingle(),
        supabase.rpc("report_access_level"),
      ]);
      if (accessResult.error) throw accessResult.error;
      if (profileResult.error) throw profileResult.error;
      const isSuperadmin = accessResult.data === "super_admin";
      if (!profileResult.data && !isSuperadmin) throw new Error("Staff profile not found.");
      const profile = profileResult.data as Staff | null;
      const role = profile?.role.toLowerCase().replaceAll("_", " ") ?? "superadmin";
      if (
        (mode === "manager" && !isSuperadmin && role !== "manager") ||
        (mode === "leader" && !["team leader", "team lead", "tl"].includes(role)) ||
        (mode === "task-manager" &&
          !isSuperadmin &&
          role !== "manager" &&
          !["team leader", "team lead", "tl"].includes(role)) ||
        (mode === "staff" && isSuperadmin)
      ) {
        throw new Error("This dashboard is not available to your account.");
      }
      let teamQuery = supabase.from("teams").select("*").eq("is_active", true);
      if (!isSuperadmin) {
        teamQuery = teamQuery.eq(role === "manager" ? "manager_id" : "team_leader_id", userId);
      }
      const { data: teams, error: teamsError } = await teamQuery.order("created_at");
      if (teamsError) throw teamsError;
      const scopedTeams = (teams ?? []) as Team[];
      const teamIds = scopedTeams.map((team) => team.id);
      let members: Staff[] = [];
      let tasks: Task[] = [];
      if (teamIds.length > 0) {
        let memberQuery = supabase.from("staff").select("*");
        if (role === "manager" || isSuperadmin) {
          const managerIds = [...new Set(scopedTeams.map((team) => team.manager_id))];
          memberQuery = memberQuery.in("manager_id", managerIds);
        } else {
          memberQuery = memberQuery.eq("team_leader_id", userId);
        }
        const [memberResult, taskResult] = await Promise.all([
          memberQuery.order("created_at", { ascending: false }).limit(500),
          supabase
            .from("tasks")
            .select("*")
            .in("team_id", teamIds)
            .order("created_at", { ascending: false })
            .limit(500),
        ]);
        if (memberResult.error) throw memberResult.error;
        if (taskResult.error) throw taskResult.error;
        members = (memberResult.data ?? []) as Staff[];
        tasks = (taskResult.data ?? []) as Task[];
      }
      if (mode === "staff") {
        const { data, error } = await supabase
          .from("tasks")
          .select("*")
          .eq("assigned_to", userId)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        tasks = (data ?? []) as Task[];
      }
      const { data: earnings, error: earningsError } = await supabase
        .from("team_task_earnings")
        .select("*")
        .eq("staff_id", userId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (earningsError) throw earningsError;
      const pendingStaff =
        mode === "leader"
          ? await supabase.rpc("team_leader_pending_staff").then(({ data, error }) => {
              if (error) throw error;
              return data ?? [];
            })
          : [];
      return {
        userId,
        profile,
        isSuperadmin,
        teams: scopedTeams,
        members,
        tasks,
        earnings: (earnings ?? []) as Earning[],
        pendingStaff,
      };
    },
    refetchInterval: 30_000,
  });
}

function TasksList({
  tasks,
  members,
  userId,
  canReview,
  canComplete,
  refresh,
}: {
  tasks: Task[];
  members: Staff[];
  userId: string;
  canReview: boolean;
  canComplete?: boolean;
  refresh: () => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  async function update(task: Task, status: "in_progress" | "completed" | "rejected") {
    let statusNote: string | undefined;
    if (status === "rejected") {
      statusNote = window.prompt("Reason for rejecting this task:")?.trim();
      if (!statusNote) return;
    }
    setBusyId(task.id);
    try {
      const { error } = await supabase.rpc("update_team_task", {
        _task_id: task.id,
        _status: status,
        ...(statusNote ? { _status_note: statusNote } : {}),
      });
      if (error) throw error;
      await refresh();
      toast.success(`Task marked ${status.replaceAll("_", " ")}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Task status could not be updated.");
    } finally {
      setBusyId(null);
    }
  }
  return tasks.length === 0 ? (
    <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
      No tasks have been created for this team.
    </p>
  ) : (
    <div className="space-y-3">
      {tasks.map((task) => (
        <article key={task.id} className="rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">{task.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Assigned to:{" "}
                {members.find((member) => member.id === task.assigned_to)?.name ??
                  (task.assigned_to === userId ? "You" : `…${task.assigned_to.slice(-8)}`)}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {task.description || "No additional details."}
              </p>
              {task.deadline_at && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Deadline: {new Date(task.deadline_at).toLocaleString()}
                </p>
              )}
              {task.status_note && (
                <p className="mt-2 text-sm text-destructive">Note: {task.status_note}</p>
              )}
            </div>
            <span className="rounded-full border px-3 py-1 text-xs capitalize">
              {task.status.replaceAll("_", " ")}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {task.assigned_to === userId && task.status === "pending" && (
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === task.id}
                onClick={() => void update(task, "in_progress")}
              >
                Start task
              </Button>
            )}
            {task.assigned_to === userId && task.status === "in_progress" && (
              <Button
                size="sm"
                disabled={busyId === task.id}
                onClick={() => void update(task, "completed")}
              >
                Submit task
              </Button>
            )}
            {canComplete && task.status === "in_progress" && task.assigned_to !== userId && (
              <Button
                size="sm"
                disabled={busyId === task.id}
                onClick={() => void update(task, "completed")}
              >
                Confirm completion
              </Button>
            )}
            {canReview && ["pending", "in_progress"].includes(task.status) && (
              <Button
                size="sm"
                variant="destructive"
                disabled={busyId === task.id}
                onClick={() => void update(task, "rejected")}
              >
                Reject task
              </Button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function Earnings({ entries }: { entries: Earning[] }) {
  const total = entries.reduce((sum, entry) => sum + entry.amount_inr, 0);
  return (
    <Card className="hover:translate-y-0">
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">Task earnings</p>
        <p className="mt-1 text-2xl font-bold">{money(total)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {entries.length} ledger entries · credited once per completed task
        </p>
      </CardContent>
    </Card>
  );
}

export function TeamTaskDashboard({ mode }: { mode: Mode }) {
  const queryClient = useQueryClient();
  const query = useTeamData(mode);
  const data = query.data;
  const assignedTasks = data?.tasks ?? [];
  const completed = assignedTasks.filter((task) => task.status === "completed").length;
  const pending = assignedTasks.filter((task) =>
    ["pending", "in_progress"].includes(task.status),
  ).length;
  const tlRows = useMemo(
    () =>
      data?.members.filter((staff) =>
        ["team leader", "team lead", "tl"].includes(staff.role.toLowerCase().replaceAll("_", " ")),
      ) ?? [],
    [data?.members],
  );
  const staffRows = useMemo(
    () =>
      data?.members.filter(
        (staff) =>
          staff.id !== data.userId && staff.role.toLowerCase().replaceAll("_", " ") !== "manager",
      ) ?? [],
    [data?.members, data?.userId],
  );
  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["team-task-data"] });
  }
  if (query.isPending) return <p>Loading team workspace…</p>;
  if (query.error || !data) {
    return (
      <p
        role="alert"
        className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
      >
        Team workspace could not be loaded: {query.error?.message ?? "No team data."}
      </p>
    );
  }

  if (mode === "staff") {
    const myTasks = assignedTasks.filter((task) => task.assigned_to === data.userId);
    return (
      <div className="space-y-5">
        <PageHeader
          title="My Team Tasks"
          subtitle="Start assigned work and submit it when complete."
        />
        <Earnings entries={data.earnings} />
        <TasksList
          tasks={myTasks}
          members={data.members}
          userId={data.userId}
          canReview={false}
          refresh={refresh}
        />
      </div>
    );
  }

  if (mode === "task-manager") {
    return (
      <div className="space-y-8">
        <TaskManagerForm data={data} refresh={refresh} />
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Assigned tasks</h2>
          <TasksList
            tasks={assignedTasks}
            members={data.members}
            userId={data.userId}
            canReview
            canComplete={data.isSuperadmin}
            refresh={refresh}
          />
        </section>
      </div>
    );
  }

  if (mode === "leader") {
    async function addStaff(staffId: string) {
      try {
        const { error } = await supabase.rpc("team_leader_add_staff", { _staff_id: staffId });
        if (error) throw error;
        toast.success("Staff added to your team and approved.");
        await refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Staff could not be added.");
      }
    }
    const pendingRows = data.pendingStaff;
    return (
      <div className="space-y-5">
        <PageHeader
          title="Team Leader Dashboard"
          subtitle={`Team performance · ${data.profile?.name ?? "Team Leader"}`}
        />
        <section className="grid gap-3 sm:grid-cols-3">
          <Metric
            title="Staff members"
            value={staffRows.filter((row) => row.id !== data.userId).length}
          />
          <Metric title="Team tasks completed" value={completed} />
          <Metric title="Pending tasks" value={pending} />
        </section>
        <Earnings entries={data.earnings} />
        <Card className="hover:translate-y-0">
          <CardContent className="space-y-3 p-5">
            <div>
              <h2 className="font-semibold">Add and approve staff</h2>
              <p className="text-sm text-muted-foreground">
                Only pending, unassigned applications are listed. Existing team members cannot be
                removed here.
              </p>
            </div>
            {pendingRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No unassigned staff applications are waiting.
              </p>
            ) : (
              pendingRows.map((staff) => (
                <div
                  key={staff.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <span>
                    {staff.name} · {staff.region_city}, {staff.region_state}
                  </span>
                  <Button size="sm" onClick={() => void addStaff(staff.id)}>
                    Add and approve
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              My staff ({staffRows.filter((row) => row.id !== data.userId).length})
            </h2>
            <Button asChild variant="outline">
              <Link to="/task-manager">Assign task</Link>
            </Button>
          </div>
          <StaffList rows={staffRows.filter((row) => row.id !== data.userId)} />
        </section>
        <TasksList
          tasks={assignedTasks}
          members={data.members}
          userId={data.userId}
          canReview
          refresh={refresh}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={mode === "manager" ? "Manager Dashboard" : "Team Dashboard"}
        subtitle={`Team oversight · ${data.profile?.name ?? "Superadmin"}`}
        action={
          <Button asChild>
            <Link to="/task-manager">Create / assign task</Link>
          </Button>
        }
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Team leaders" value={tlRows.length} />
        <Metric
          title="Team members"
          value={staffRows.filter((row) => row.id !== data.userId).length}
        />
        <Metric title="Total tasks" value={assignedTasks.length} />
        <Metric title="Completed / pending" value={`${completed} / ${pending}`} />
      </section>
      <Earnings entries={data.earnings} />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Team leaders</h2>
        <StaffList rows={tlRows} />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Task activity</h2>
        <TasksList
          tasks={assignedTasks}
          members={data.members}
          userId={data.userId}
          canReview
          refresh={refresh}
        />
      </section>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string | number }) {
  return (
    <Card className="hover:translate-y-0">
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function StaffList({ rows }: { rows: Staff[] }) {
  return rows.length === 0 ? (
    <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
      No staff members are assigned to this team yet.
    </p>
  ) : (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="p-3">Name</th>
            <th className="p-3">Email</th>
            <th className="p-3">Role</th>
            <th className="p-3">Status</th>
            <th className="p-3">Location</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0">
              <td className="p-3 font-medium">{row.name}</td>
              <td className="p-3">{row.email}</td>
              <td className="p-3">{row.role}</td>
              <td className="p-3 capitalize">{row.status}</td>
              <td className="p-3">
                {row.region_city}, {row.region_state}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TaskManagerForm({
  data,
  refresh,
}: {
  data: NonNullable<ReturnType<typeof useTeamData>["data"]>;
  refresh: () => Promise<void>;
}) {
  const isManager = data.profile?.role.toLowerCase() === "manager";
  const assignees = data.members.filter((member) =>
    data.isSuperadmin
      ? member.role.toLowerCase() !== "manager"
      : isManager
        ? member.id !== data.userId && member.role.toLowerCase() !== "manager"
        : member.id !== data.userId &&
          !["team leader", "team lead", "tl"].includes(
            member.role.toLowerCase().replaceAll("_", " "),
          ) &&
          member.status !== "pending",
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected.length) {
      toast.error("Select at least one assignee.");
      return;
    }
    setBusy(true);
    try {
      const { data: count, error } = await supabase.rpc("create_team_tasks", {
        _title: title.trim(),
        _description: description.trim(),
        _assignees: selected,
        _deadline_at: deadline ? new Date(deadline).toISOString() : null,
      });
      if (error) throw error;
      toast.success(`${count} task${count === 1 ? "" : "s"} assigned.`);
      setTitle("");
      setDescription("");
      setDeadline("");
      setSelected([]);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tasks could not be assigned.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Task Manager"
        subtitle="Create one task or assign the same task to multiple team members."
      />
      <Card className="hover:translate-y-0">
        <CardContent className="p-5 sm:p-7">
          <form className="space-y-4" onSubmit={(event) => void submit(event)}>
            <div className="space-y-2">
              <Label htmlFor="team-task-title">Title</Label>
              <Input
                id="team-task-title"
                required
                maxLength={160}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-task-description">Description</Label>
              <Textarea
                id="team-task-description"
                maxLength={5000}
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-task-deadline">Deadline (optional)</Label>
              <Input
                id="team-task-deadline"
                type="datetime-local"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Assign to</legend>
              {assignees.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No eligible team members are available.
                </p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-3">
                  {assignees.map((member) => (
                    <label key={member.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected.includes(member.id)}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, member.id]
                              : current.filter((id) => id !== member.id),
                          )
                        }
                      />
                      {member.name} · {member.role} · {member.status}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <p className="text-xs text-muted-foreground">
              A completed task automatically credits ₹90 to the staff assignee, ₹40 to the team
              leader, and ₹20 to the manager. Team-leader-assigned work credits the leader ₹40 and
              manager ₹20. Earnings are stored once per task.
            </p>
            <Button type="submit" disabled={busy || assignees.length === 0}>
              {busy
                ? "Assigning…"
                : `Assign ${selected.length || ""} task${selected.length === 1 ? "" : "s"}`}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
