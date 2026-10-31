import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Building2, LoaderCircle, Plus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  assignResellerBusiness,
  createResellerBusiness,
  createResellerStaffMember,
  createResellerTeamLeader,
  getResellerWorkspace,
} from "@/lib/reseller.functions";

type WorkspaceAction = "business" | "leader" | "member" | null;

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

export function ResellerWorkspaceTools() {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<WorkspaceAction>(null);
  const [busy, setBusy] = useState(false);
  const [teamLeaderId, setTeamLeaderId] = useState("");
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>({});
  const workspaceQuery = useQuery({
    queryKey: ["reseller-workspace"],
    queryFn: () => getResellerWorkspace(),
    refetchInterval: 30_000,
  });
  const workspace = workspaceQuery.data;

  async function refreshWorkspace() {
    await queryClient.invalidateQueries({ queryKey: ["reseller-workspace"] });
  }

  async function addBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    try {
      await createResellerBusiness({
        data: {
          businessName: String(form.get("businessName") ?? ""),
          mapsUrl: String(form.get("mapsUrl") ?? ""),
          ownerName: String(form.get("ownerName") ?? ""),
          ownerEmail: String(form.get("ownerEmail") ?? ""),
          ownerMobile: String(form.get("ownerMobile") ?? ""),
        },
      });
      formElement.reset();
      setAction(null);
      toast.success("Business added to your client list.");
      await refreshWorkspace();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function addTeamLeader(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    try {
      await createResellerTeamLeader({
        data: {
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
          mobileNumber: String(form.get("mobileNumber") ?? ""),
        },
      });
      formElement.reset();
      setAction(null);
      toast.success("Team Leader login and team created.");
      await refreshWorkspace();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function addTeamMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    try {
      await createResellerStaffMember({
        data: {
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
          mobileNumber: String(form.get("mobileNumber") ?? ""),
          teamLeaderId,
        },
      });
      formElement.reset();
      setTeamLeaderId("");
      setAction(null);
      toast.success("Staff/Member login added to the selected team.");
      await refreshWorkspace();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function assignWork(event: FormEvent<HTMLFormElement>, clientId: string) {
    event.preventDefault();
    setBusy(true);
    try {
      await assignResellerBusiness({
        data: {
          resellerBusinessId: clientId,
          teamLeaderId: assignmentDrafts[clientId] || null,
        },
      });
      toast.success("Business assignment updated.");
      await refreshWorkspace();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="clients-team" className="scroll-mt-20 space-y-5">
      <Card className="hover:translate-y-0">
        <CardContent className="space-y-5 p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-primary">Reseller workspace</p>
              <h2 className="mt-1 text-xl font-semibold">Clients &amp; team</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Add businesses, create team logins, and assign client work to your Team Leaders.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={action === "business" ? "default" : "outline"}
                aria-expanded={action === "business"}
                onClick={() => setAction(action === "business" ? null : "business")}
              >
                <Building2 className="mr-2 size-4" /> Add Business
              </Button>
              <Button
                type="button"
                variant={action === "leader" ? "default" : "outline"}
                aria-expanded={action === "leader"}
                onClick={() => setAction(action === "leader" ? null : "leader")}
              >
                <Users className="mr-2 size-4" /> Add Team Leader
              </Button>
              <Button
                type="button"
                variant={action === "member" ? "default" : "outline"}
                aria-expanded={action === "member"}
                disabled={!workspace?.teamLeaders.length}
                title={!workspace?.teamLeaders.length ? "Add a Team Leader first." : undefined}
                onClick={() => setAction(action === "member" ? null : "member")}
              >
                <UserPlus className="mr-2 size-4" /> Add Staff/Member
              </Button>
            </div>
          </div>

          {workspaceQuery.error && (
            <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">
              Reseller clients and team could not be loaded: {errorText(workspaceQuery.error)}
            </p>
          )}

          {action === "business" && (
            <form
              onSubmit={(event) => void addBusiness(event)}
              className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2"
            >
              <div className="space-y-2">
                <Label htmlFor="reseller-business-name">Business name</Label>
                <Input id="reseller-business-name" name="businessName" maxLength={160} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reseller-business-maps">Google Maps URL</Label>
                <Input
                  id="reseller-business-maps"
                  name="mapsUrl"
                  type="url"
                  placeholder="https://maps.google.com/..."
                  maxLength={2048}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reseller-owner-name">Owner name</Label>
                <Input id="reseller-owner-name" name="ownerName" maxLength={120} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reseller-owner-email">Owner email</Label>
                <Input id="reseller-owner-email" name="ownerEmail" type="email" maxLength={320} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reseller-owner-mobile">Owner phone</Label>
                <Input
                  id="reseller-owner-mobile"
                  name="ownerMobile"
                  type="tel"
                  autoComplete="tel"
                  maxLength={32}
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                This saves a business and owner contact record; it does not create an owner login.
              </p>
              <div className="flex items-end gap-2">
                <Button type="submit" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 size-4" />
                  )}
                  Save Business
                </Button>
                <Button type="button" variant="ghost" onClick={() => setAction(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {action === "leader" && (
            <form
              onSubmit={(event) => void addTeamLeader(event)}
              className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2"
            >
              <div className="space-y-2">
                <Label htmlFor="reseller-leader-name">Team Leader name</Label>
                <Input id="reseller-leader-name" name="name" maxLength={120} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reseller-leader-email">Login email</Label>
                <Input id="reseller-leader-email" name="email" type="email" maxLength={320} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reseller-leader-mobile">Mobile number</Label>
                <Input id="reseller-leader-mobile" name="mobileNumber" type="tel" maxLength={32} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reseller-leader-password">Initial password</Label>
                <Input
                  id="reseller-leader-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 size-4" />
                  )}
                  Create Team Leader
                </Button>
              </div>
            </form>
          )}

          {action === "member" && (
            <form
              onSubmit={(event) => void addTeamMember(event)}
              className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2"
            >
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="reseller-member-leader">Team Leader</Label>
                <select
                  id="reseller-member-leader"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={teamLeaderId}
                  onChange={(event) => setTeamLeaderId(event.target.value)}
                  required
                >
                  <option value="">Select a Team Leader</option>
                  {workspace?.teamLeaders.map((leader) => (
                    <option key={leader.id} value={leader.id}>
                      {leader.name} · {leader.uniqueId}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reseller-member-name">Staff/Member name</Label>
                <Input id="reseller-member-name" name="name" maxLength={120} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reseller-member-email">Login email</Label>
                <Input id="reseller-member-email" name="email" type="email" maxLength={320} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reseller-member-mobile">Mobile number</Label>
                <Input id="reseller-member-mobile" name="mobileNumber" type="tel" maxLength={32} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reseller-member-password">Initial password</Label>
                <Input
                  id="reseller-member-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={busy || !teamLeaderId}>
                  {busy ? (
                    <LoaderCircle className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 size-4" />
                  )}
                  Create Staff/Member
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card className="hover:translate-y-0">
        <CardContent className="p-5 sm:p-7">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">My Clients</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Businesses and owner contacts registered by this reseller account.
              </p>
            </div>
            {workspaceQuery.isFetching && <LoaderCircle className="size-4 animate-spin" />}
          </div>
          {!workspaceQuery.error && !workspaceQuery.isPending && !workspace?.clients.length && (
            <p className="rounded-xl border border-dashed p-7 text-center text-sm text-muted-foreground">
              No businesses added yet. Choose Add Business to create your first client entry.
            </p>
          )}
          {!!workspace?.clients.length && (
            <div className="space-y-3">
              {workspace.clients.map((client) => (
                <form
                  key={client.id}
                  onSubmit={(event) => void assignWork(event, client.id)}
                  className="grid gap-3 rounded-xl border p-4 lg:grid-cols-[1fr_1fr_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{client.name}</p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {client.ownerName} · {client.ownerEmail} · {client.ownerMobile}
                    </p>
                    {client.mapsUrl && (
                      <a
                        href={client.mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block max-w-full truncate text-xs text-primary underline"
                      >
                        Open Google Maps
                      </a>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`assign-${client.id}`}>Assign work to Team Leader</Label>
                    <select
                      id={`assign-${client.id}`}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={assignmentDrafts[client.id] ?? client.teamLeaderId ?? ""}
                      onChange={(event) =>
                        setAssignmentDrafts((current) => ({
                          ...current,
                          [client.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Unassigned</option>
                      {workspace.teamLeaders.map((leader) => (
                        <option key={leader.id} value={leader.id}>
                          {leader.name} · {leader.uniqueId}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Current: {client.teamLeaderName ?? "Unassigned"}
                    </p>
                  </div>
                  <div className="flex items-center">
                    <Button type="submit" variant="outline" disabled={busy}>
                      {busy ? "Saving…" : "Assign Work"}
                    </Button>
                  </div>
                </form>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="hover:translate-y-0">
          <CardContent className="p-5 sm:p-7">
            <h2 className="font-semibold">My Team Leaders</h2>
            {!workspace?.teamLeaders.length ? (
              <p className="mt-3 text-sm text-muted-foreground">No Team Leaders have been added.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {workspace.teamLeaders.map((leader) => (
                  <li key={leader.id} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm">
                    <span>
                      <span className="block font-medium">{leader.name} · {leader.uniqueId}</span>
                      <span className="text-muted-foreground">{leader.email} · {leader.status}</span>
                    </span>
                    <span className="text-muted-foreground">{leader.memberCount} members</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="hover:translate-y-0">
          <CardContent className="p-5 sm:p-7">
            <h2 className="font-semibold">My Staff/Members</h2>
            {!workspace?.teamMembers.length ? (
              <p className="mt-3 text-sm text-muted-foreground">No Staff/Member accounts have been added.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {workspace.teamMembers.map((member) => (
                  <li key={member.id} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm">
                    <span>
                      <span className="block font-medium">{member.name} · {member.uniqueId}</span>
                      <span className="text-muted-foreground">{member.email} · {member.status}</span>
                    </span>
                    <span className="text-muted-foreground">{member.teamLeaderName}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
