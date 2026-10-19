import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, LockKeyhole, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { profileQuery } from "@/lib/profile";

export const Route = createFileRoute("/_authenticated/client/settings")({
  component: ClientSettingsPage,
});

function ClientSettingsPage() {
  const { user } = Route.useRouteContext();
  const profile = useQuery(profileQuery());
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (profile.data) setName(profile.data.name);
  }, [profile.data]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ name: name.trim() || "User", updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile updated.");
    } catch {
      toast.error("Could not save your profile. Please try again.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Use a password with at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("The new passwords do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        current_password: currentPassword,
      });
      if (error) throw error;
      toast.success("Password changed.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change your password.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <div>
        <p className="text-sm font-medium text-primary">Account preferences</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Settings / Profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage the profile and sign-in details for your client account.
        </p>
      </div>

      {profile.error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          Profile information could not be loaded. Please refresh.
        </p>
      )}

      <Card className="hover:translate-y-0">
        <CardContent className="p-5 sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <UserRound className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">Basic profile</h2>
              <p className="text-sm text-muted-foreground">Your name and account email</p>
            </div>
          </div>
          <form onSubmit={(event) => void saveProfile(event)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client-name">Name</Label>
              <Input
                id="client-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                disabled={profile.isPending || savingProfile}
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-email">Email</Label>
              <Input id="client-email" type="email" value={user.email ?? ""} readOnly disabled />
              <p className="text-xs text-muted-foreground">Email changes are managed by support.</p>
            </div>
            <Button type="submit" disabled={profile.isPending || savingProfile}>
              {savingProfile && <LoaderCircle className="mr-2 size-4 animate-spin" />}
              Save profile
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="hover:translate-y-0">
        <CardContent className="p-5 sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <LockKeyhole className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">Change password</h2>
              <p className="text-sm text-muted-foreground">
                Choose a strong password you do not reuse.
              </p>
            </div>
          </div>
          <form onSubmit={(event) => void changePassword(event)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <Button type="submit" variant="outline" disabled={savingPassword}>
              {savingPassword && <LoaderCircle className="mr-2 size-4 animate-spin" />}
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
