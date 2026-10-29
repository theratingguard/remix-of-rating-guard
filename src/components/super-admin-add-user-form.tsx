import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { ProfilePhotoInput, type EncodedProfilePhoto } from "@/components/profile-photo-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getUserCreationOptions } from "@/lib/user-creation.functions";
import { postUserCreation } from "@/lib/user-creation.client";

type UserRole = "Global Manager" | "Team Leader" | "Staff";

export function SuperAdminAddUserForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const queryClient = useQueryClient();
  const loadOptions = useServerFn(getUserCreationOptions);
  const options = useQuery({
    queryKey: ["user-creation-options"],
    queryFn: () => loadOptions(),
  });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [photo, setPhoto] = useState<EncodedProfilePhoto | null>(null);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [role, setRole] = useState<UserRole>("Staff");
  const [teamId, setTeamId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mobileNumber.trim() || !photo) {
      toast.error("Photo and Mobile are mandatory.");
      return;
    }
    setBusy(true);
    try {
      await postUserCreation("/api/super-admin/add-user", {
        name,
        email,
        password,
        mobileNumber,
        photo,
        role,
        ...(role === "Staff" && teamId ? { teamId } : {}),
        ...(role === "Team Leader" && managerId ? { managerId } : {}),
      });
      await onCreated();
      await queryClient.invalidateQueries({ queryKey: ["user-creation-options"] });
      setName("");
      setEmail("");
      setPassword("");
      setMobileNumber("");
      setPhoto(null);
      setPhotoInputKey((key) => key + 1);
      setTeamId("");
      setManagerId("");
      toast.success(`${role === "Staff" ? "Team Member" : role} account created and activated.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the account.");
    } finally {
      setBusy(false);
    }
  }

  const missingAssignment =
    (role === "Staff" && !teamId) || (role === "Team Leader" && !managerId);

  return (
    <section className="surface space-y-4 p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">Add User</h2>
        <p className="text-sm text-muted-foreground">
          Create an active account directly. Super Admin-created users do not enter the approval
          queue.
        </p>
      </div>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
        <div className="space-y-2">
          <Label htmlFor="admin-user-name">Full Name</Label>
          <Input
            id="admin-user-name"
            autoComplete="name"
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-user-email">Email</Label>
          <Input
            id="admin-user-email"
            type="email"
            autoComplete="email"
            required
            maxLength={320}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-user-password">Password</Label>
          <Input
            id="admin-user-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-user-mobile">Mobile Number</Label>
          <Input
            id="admin-user-mobile"
            type="tel"
            autoComplete="tel"
            required
            minLength={6}
            maxLength={32}
            value={mobileNumber}
            onChange={(event) => setMobileNumber(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-user-role">Role</Label>
          <select
            id="admin-user-role"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={role}
            disabled={busy}
            onChange={(event) => {
              const selectedRole = event.target.value;
              if (
                selectedRole === "Global Manager" ||
                selectedRole === "Team Leader" ||
                selectedRole === "Staff"
              )
                setRole(selectedRole);
              setTeamId("");
              setManagerId("");
            }}
          >
            <option value="Global Manager">Global Manager</option>
            <option value="Team Leader">Team Leader</option>
            <option value="Staff">Team Member</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-user-assignment">
            {role === "Team Leader"
              ? "Assign to Team Manager"
              : role === "Staff"
                ? "Team Assignment"
                : "Hierarchy placement"}
          </Label>
          {role === "Team Leader" ? (
            <select
              id="admin-user-assignment"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              required
              disabled={busy || options.isPending}
              value={managerId}
              onChange={(event) => setManagerId(event.target.value)}
            >
              <option value="">Select a Team Manager</option>
              {(options.data?.managers ?? []).map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.name}
                </option>
              ))}
            </select>
          ) : role === "Staff" ? (
            <select
              id="admin-user-assignment"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              required
              disabled={busy || options.isPending}
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
            >
              <option value="">Select a team</option>
              {(options.data?.teams ?? []).map((team) => (
                <option key={team.id} value={team.id}>
                  {team.manager_name} · {team.team_leader_name}
                </option>
              ))}
            </select>
          ) : (
            <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
              This is the root role for the management hierarchy.
            </p>
          )}
          {options.error && (
            <p role="alert" className="text-xs text-destructive">
              Could not load assignment options: {options.error.message}
            </p>
          )}
          {options.data &&
            ((role === "Team Leader" && options.data.managers.length === 0) ||
              (role === "Staff" && options.data.teams.length === 0)) && (
              <p className="text-xs text-muted-foreground">
                {role === "Team Leader"
                  ? "Create or activate a Team Manager first."
                  : "Create a Team Leader and team first."}
              </p>
            )}
        </div>
        <div className="sm:col-span-2">
          <ProfilePhotoInput key={photoInputKey} onChange={setPhoto} disabled={busy} />
        </div>
        <div className="sm:col-span-2">
          <Button
            type="submit"
            disabled={busy || !mobileNumber.trim() || !photo || missingAssignment || !!options.error}
          >
            {busy && <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden />}
            {busy ? "Creating account…" : "Add User"}
          </Button>
        </div>
      </form>
    </section>
  );
}
