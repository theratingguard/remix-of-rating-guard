import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postUserCreation } from "@/lib/user-creation";

type CreatedMember = {
  unique_id: string;
  role: "Team Leader";
  team_id: string | null;
};

export function ManagerAddMemberForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [createdMember, setCreatedMember] = useState<CreatedMember | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setCreatedMember(null);
    try {
      const created = await postUserCreation<CreatedMember>("/api/manager/add-member", {
        name,
        email,
        password,
        mobileNumber,
        role: "Team Leader",
      });
      setCreatedMember(created);
      setName("");
      setEmail("");
      setPassword("");
      setMobileNumber("");
      toast.success("Member created and sent to Super Admin for approval.");
      try {
        await onCreated();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? `Member created, but the list could not refresh: ${error.message}`
            : "Member created, but the list could not refresh.",
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the member.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="hover:translate-y-0">
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="font-semibold">Add Member</h2>
          <p className="text-sm text-muted-foreground">
            Team Managers can add only direct-report Team Leaders. New accounts remain pending until
            approved by a Super Admin.
          </p>
        </div>
        {createdMember && (
          <div
            role="status"
            className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"
          >
            <p className="font-medium">Pending Super Admin Approval</p>
            <p className="mt-1">
              User ID: {createdMember.unique_id} · {createdMember.role}
            </p>
          </div>
        )}
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
          <div className="space-y-2">
            <Label htmlFor="manager-member-name">Full Name</Label>
            <Input
              id="manager-member-name"
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manager-member-email">Email</Label>
            <Input
              id="manager-member-email"
              type="email"
              required
              maxLength={320}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manager-member-password">Password</Label>
            <Input
              id="manager-member-password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manager-member-mobile">Mobile Number</Label>
            <Input
              id="manager-member-mobile"
              type="tel"
              required
              minLength={6}
              maxLength={32}
              value={mobileNumber}
              onChange={(event) => setMobileNumber(event.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={busy}>
              {busy && <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden />}
              {busy ? "Creating…" : "Add Member"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
