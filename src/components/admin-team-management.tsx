import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Staff = Tables<"staff">;
type Team = Tables<"teams">;

export function AdminTeamManagement() {
  const queryClient = useQueryClient();
  const [managerId, setManagerId] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [staffLeaderId, setStaffLeaderId] = useState("");
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["admin-team-management"],
    queryFn: async () => {
      const { data: access, error: accessError } = await supabase.rpc("report_access_level");
      if (accessError) throw accessError;
      if (access !== "super_admin") throw new Error("Superadmin access required.");
      const [staffResult, teamsResult] = await Promise.all([
        supabase.from("staff").select("*").order("name").limit(1000),
        supabase.from("teams").select("*").order("created_at", { ascending: false }).limit(500),
      ]);
      if (staffResult.error) throw staffResult.error;
      if (teamsResult.error) throw teamsResult.error;
      return {
        staff: (staffResult.data ?? []) as Staff[],
        teams: (teamsResult.data ?? []) as Team[],
      };
    },
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-team-management"] });
  async function submitTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!managerId || !leaderId || managerId === leaderId) {
      toast.error("Choose two different approved staff accounts.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_create_team", {
        _manager_id: managerId,
        _team_leader_id: leaderId,
      });
      if (error) throw error;
      toast.success("Manager and team leader linked to a new team.");
      setManagerId("");
      setLeaderId("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Team could not be created.");
    } finally {
      setBusy(false);
    }
  }
  async function submitStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!staffId || !staffLeaderId) {
      toast.error("Choose a staff member and team leader.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_assign_staff_to_team", {
        _staff_id: staffId,
        _team_leader_id: staffLeaderId,
      });
      if (error) throw error;
      toast.success("Staff member assigned to the team.");
      setStaffId("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Staff could not be assigned.");
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending) return <p>Loading staff and team records…</p>;
  if (query.error || !query.data) {
    return (
      <p
        role="alert"
        className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
      >
        Team management is unavailable: {query.error?.message ?? "Could not load records."}
      </p>
    );
  }
  const approved = query.data.staff.filter((row) => ["approved", "active"].includes(row.status));
  const leaders = approved.filter((row) =>
    ["team leader", "team lead", "tl"].includes(row.role.toLowerCase().replaceAll("_", " ")),
  );
  const regularStaff = approved.filter(
    (row) =>
      !["manager", "team leader", "team_leader", "team lead", "tl"].includes(
        row.role.toLowerCase(),
      ),
  );
  const teamLeaderIds = new Set(query.data.teams.map((team) => team.team_leader_id));
  const staffById = new Map(query.data.staff.map((row) => [row.id, row]));
  const unassignedLeaders = leaders.filter(
    (row) => !teamLeaderIds.has(row.id) && !row.manager_id && !row.team_leader_id,
  );
  const promotionCandidates = approved.filter(
    (row) =>
      !["manager", "team leader", "team_leader", "team lead", "tl"].includes(
        row.role.toLowerCase(),
      ) &&
      !row.manager_id &&
      !row.team_leader_id,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Team Management"
        subtitle="Only Superadmin can create teams, assign staff, and change team leadership."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="hover:translate-y-0">
          <CardContent className="p-5">
            <h2 className="font-semibold">Create manager + team leader link</h2>
            <form className="mt-4 space-y-3" onSubmit={(event) => void submitTeam(event)}>
              <label className="block space-y-1 text-sm">
                Manager
                <select
                  required
                  value={managerId}
                  onChange={(event) => setManagerId(event.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3"
                >
                  <option value="">Select approved manager</option>
                  {approved
                    .filter(
                      (row) =>
                        row.id !== leaderId &&
                        !row.manager_id &&
                        !row.team_leader_id &&
                        !["team leader", "team lead", "team_leader", "tl"].includes(
                          row.role.toLowerCase(),
                        ),
                    )
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name} · {row.email}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                Team Leader
                <select
                  required
                  value={leaderId}
                  onChange={(event) => setLeaderId(event.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3"
                >
                  <option value="">Select approved unassigned team leader</option>
                  {unassignedLeaders
                    .filter((row) => row.id !== managerId)
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name} · {row.email}
                      </option>
                    ))}
                  {promotionCandidates
                    .filter((row) => row.id !== managerId)
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name} · {row.email} (promote to Team Leader)
                      </option>
                    ))}
                </select>
              </label>
              <Button type="submit" disabled={busy}>
                Create team
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card className="hover:translate-y-0">
          <CardContent className="p-5">
            <h2 className="font-semibold">Assign existing staff</h2>
            <form className="mt-4 space-y-3" onSubmit={(event) => void submitStaff(event)}>
              <label className="block space-y-1 text-sm">
                Staff member
                <select
                  required
                  value={staffId}
                  onChange={(event) => setStaffId(event.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3"
                >
                  <option value="">Select approved staff</option>
                  {regularStaff.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} · {row.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                Team Leader
                <select
                  required
                  value={staffLeaderId}
                  onChange={(event) => setStaffLeaderId(event.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3"
                >
                  <option value="">Select a team leader</option>
                  {leaders
                    .filter((row) => teamLeaderIds.has(row.id))
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name} · {row.email}
                      </option>
                    ))}
                </select>
              </label>
              <Button type="submit" variant="outline" disabled={busy}>
                Assign staff
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Card className="hover:translate-y-0">
        <CardContent className="p-5">
          <h2 className="mb-4 font-semibold">Teams ({query.data.teams.length})</h2>
          {query.data.teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No teams have been created yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="p-3">Manager</th>
                    <th className="p-3">Team Leader</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.teams.map((team) => (
                    <tr key={team.id} className="border-b last:border-0">
                      <td className="p-3">
                        {staffById.get(team.manager_id)?.name ?? team.manager_id}
                      </td>
                      <td className="p-3">
                        {staffById.get(team.team_leader_id)?.name ?? team.team_leader_id}
                      </td>
                      <td className="p-3">{team.is_active ? "Active" : "Inactive"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Manager and team leader accounts are existing approved staff profiles. Creating or changing
        a team never deletes a staff or team-leader account.
      </p>
    </div>
  );
}
