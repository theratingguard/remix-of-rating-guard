import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { ProfilePhotoInput, type EncodedProfilePhoto } from "@/components/profile-photo-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postUserCreation } from "@/lib/user-creation";

export function TeamLeaderAddStaffForm({ hasActiveTeam }: { hasActiveTeam: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [photo, setPhoto] = useState<EncodedProfilePhoto | null>(null);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mobileNumber.trim() || !photo) {
      toast.error("Photo and Mobile are mandatory.");
      return;
    }
    setBusy(true);
    try {
      await postUserCreation("/api/team-leader/add-staff", {
        name,
        email,
        password,
        mobileNumber,
        photo,
      });
      setName("");
      setEmail("");
      setPassword("");
      setMobileNumber("");
      setPhoto(null);
      setPhotoInputKey((key) => key + 1);
      toast.success("Staff account created and sent to Super Admin for approval.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the staff account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="hover:translate-y-0">
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="font-semibold">Add Staff</h2>
          <p className="text-sm text-muted-foreground">
            New staff are assigned to your active team and remain pending until a Super Admin
            approves them.
          </p>
        </div>
        {!hasActiveTeam && (
          <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm">
            No active team is assigned to your account. Ask a Super Admin to set up your team.
          </p>
        )}
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
          <div className="space-y-2">
            <Label htmlFor="team-leader-staff-name">Full Name</Label>
            <Input
              id="team-leader-staff-name"
              autoComplete="name"
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-leader-staff-email">Email</Label>
            <Input
              id="team-leader-staff-email"
              type="email"
              autoComplete="email"
              required
              maxLength={320}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-leader-staff-password">Password</Label>
            <Input
              id="team-leader-staff-password"
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
            <Label htmlFor="team-leader-staff-mobile">Mobile Number</Label>
            <Input
              id="team-leader-staff-mobile"
              type="tel"
              autoComplete="tel"
              required
              minLength={6}
              maxLength={32}
              value={mobileNumber}
              onChange={(event) => setMobileNumber(event.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <ProfilePhotoInput key={photoInputKey} onChange={setPhoto} disabled={busy} />
          </div>
          <div className="sm:col-span-2">
            <Button
              type="submit"
              disabled={busy || !hasActiveTeam || !mobileNumber.trim() || !photo}
            >
              {busy && <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden />}
              {busy ? "Creating staff…" : "Save"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
