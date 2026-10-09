import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { profileQuery } from "@/lib/profile";
import { APP_DOMAIN } from "@/lib/config";
import { PageHeader, Avatar } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Admin Profile — The Rating Guard" }, { name: "description", content: "Admin profile, security and session." }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: p, isLoading } = useQuery(profileQuery());
  const [name, setName] = useState(""); const [username, setUsername] = useState(""); const [email, setEmail] = useState("");
  const [cur, setCur] = useState(""); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (p) { setName(p.name); setUsername(p.username); setEmail(p.email); } }, [p]);

  async function savePersonal(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const { error } = await supabase.from("profiles").update({ name: name.trim() || "Admin", username: username.trim(), updated_at: new Date().toISOString() }).eq("user_id", user.id);
      if (error) throw error;
      if (email.trim() && email.trim() !== p?.email) {
        const r = await supabase.auth.updateUser({ email: email.trim() }, { emailRedirectTo: window.location.origin });
        if (r.error) throw r.error;
        toast.success("Check both inboxes to confirm the new email address.");
      } else toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not save"); }
    finally { setBusy(false); }
  }

  async function uploadPhoto(f: File) {
    if (!f.type.startsWith("image/")) { toast.error("Choose an image file"); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return; }
    const path = `${user.id}/avatar-${Date.now()}.${f.name.split(".").pop() ?? "jpg"}`;
    const up = await supabase.storage.from("avatars").upload(path, f, { upsert: true, contentType: f.type });
    if (up.error) { toast.error(up.error.message); return; }
    await supabase.from("profiles").update({ avatar_path: path }).eq("user_id", user.id);
    toast.success("Photo updated");
    qc.invalidateQueries({ queryKey: ["profile"] });
  }

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { toast.error("New password must be at least 8 characters"); return; }
    if (pw !== pw2) { toast.error("Passwords do not match"); return; }
    const { error } = await supabase.auth.updateUser({ password: pw, current_password: cur } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated"); setCur(""); setPw(""); setPw2("");
  }

  async function logout() {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (isLoading || !p) return <div className="text-muted-foreground">Loading profile…</div>;

  return (
    <>
      <PageHeader title="Admin Profile" subtitle={APP_DOMAIN} />
      <div className="surface mb-6 flex flex-wrap items-center gap-5 p-6">
        <div className="relative">
          <Avatar name={p.name} url={p.avatarUrl} size={72} />
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="Change profile photo"
            className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-lift)]">
            <Camera className="h-4 w-4" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
        </div>
        <div className="flex-1">
          <div className="text-xl font-bold">{p.name}</div>
          <div className="text-sm text-muted-foreground">{p.username}</div>
          <div className="text-sm text-muted-foreground">{p.email}</div>
        </div>
        <div className="space-y-1 text-right text-sm">
          <div><span className="rounded-full bg-risk-normal-soft px-2.5 py-1 text-xs font-semibold capitalize text-risk-normal">{p.status}</span></div>
          <div className="text-muted-foreground">Last login: {p.lastLogin ? new Date(p.lastLogin).toLocaleString() : "—"}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={savePersonal} className="surface space-y-4 p-6">
          <h2 className="font-semibold">Personal information</h2>
          <div className="space-y-2"><Label htmlFor="p-name">Name</Label><Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Admin" /></div>
          <div className="space-y-2"><Label htmlFor="p-user">Username</Label><Input id="p-user" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="p-email">Email</Label><Input id="p-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {p.pendingEmail && <p className="text-xs text-risk-medium">Pending confirmation: {p.pendingEmail}</p>}</div>
          <div className="space-y-2"><Label>Profile photo</Label><div><Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Camera /> Upload photo</Button></div></div>
          <Button type="submit" disabled={busy}>Save changes</Button>
        </form>

        <div className="space-y-6">
          <form onSubmit={changePw} className="surface space-y-4 p-6">
            <h2 className="font-semibold">Security</h2>
            <div className="space-y-2"><Label htmlFor="c-pw">Current password</Label><Input id="c-pw" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="n-pw">New password</Label><Input id="n-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="n-pw2">Confirm password</Label><Input id="n-pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></div>
            <Button type="submit">Update password</Button>
          </form>
          <section className="surface space-y-3 p-6">
            <h2 className="font-semibold">Session</h2>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Last login</span><span>{p.lastLogin ? new Date(p.lastLogin).toLocaleString() : "—"}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Active session</span><span>This browser</span></div>
            <Button variant="outline" onClick={logout}><LogOut /> Logout</Button>
          </section>
        </div>
      </div>
    </>
  );
}
