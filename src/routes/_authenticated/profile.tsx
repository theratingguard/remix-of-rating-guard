import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Camera, Clock3, KeyRound, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { profileQuery } from "@/lib/profile";
import { APP_DOMAIN } from "@/lib/config";
import { PageHeader, Avatar } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your Profile — Rating Guard Remix" },
      { name: "description", content: "Your profile, security and session." },
    ],
  }),
  component: ProfilePage,
});

type MfaFactor = {
  id: string;
  factor_type: "totp" | "phone" | "recovery_code" | "webauthn";
  friendly_name?: string;
  status: "verified" | "unverified";
  phone?: string;
};
type PendingFactor = {
  id: string;
  type: "totp" | "phone";
  qrCode?: string;
  secret?: string;
  challengeId?: string;
};

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: p, isLoading, error: profileError } = useQuery(profileQuery());
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState("UTC");
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [pendingFactor, setPendingFactor] = useState<PendingFactor | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [phoneToEnroll, setPhoneToEnroll] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryRemaining, setRecoveryRemaining] = useState<number | null>(null);
  const [mfaError, setMfaError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!p) return;
    setName(p.name);
    setUsername(p.username);
    setEmail(p.email);
    setPhone(p.phone);
    setCompanyName(p.companyName);
    setBusinessType(p.businessType);
    setEmailNotifications(p.emailNotifications);
    setLanguage(p.language);
    setTimezone(p.timezone);
  }, [p]);

  async function refreshFactors() {
    setMfaError("");
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    setFactors(data.all as MfaFactor[]);
    const recovery = await supabase.auth.mfa.recoveryCodes.getStatus();
    if (recovery.error) {
      if (recovery.error.code === "mfa_factor_not_found") {
        setRecoveryRemaining(0);
      } else {
        setRecoveryRemaining(null);
        setMfaError(
          `Recovery codes are unavailable: ${recovery.error.message}. Check that recovery codes are enabled in Supabase Auth settings.`,
        );
      }
    } else {
      setRecoveryRemaining(recovery.data.remaining);
    }
  }

  useEffect(() => {
    void refreshFactors().catch((error: unknown) => {
      setMfaError(error instanceof Error ? error.message : "Could not load MFA factors.");
    });
  }, []);

  async function savePersonal(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          name: name.trim() || "User",
          username: username.trim(),
          phone: phone.trim() || null,
          company_name: companyName.trim() || null,
          business_type: businessType.trim() || null,
          email_notifications: emailNotifications,
          language,
          timezone: timezone.trim() || "UTC",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
      if (error) throw error;
      if (email.trim() && email.trim() !== p?.email) {
        const result = await supabase.auth.updateUser(
          { email: email.trim() },
          { emailRedirectTo: window.location.origin },
        );
        if (result.error) throw result.error;
        toast.success("Check both inboxes to confirm the new email address.");
      } else toast.success("Profile saved");
      await qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save profile.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
      const path = `${user.id}/avatar.${extension}`;
      const upload = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upload.error) throw upload.error;
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_path: path, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success("Profile photo updated.");
      await qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload profile photo.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function changePw(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (pw !== pw2) {
      toast.error("Passwords do not match.");
      return;
    }
    const { error } = await supabase.auth.updateUser({
      password: pw,
      current_password: cur,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated.");
    setCur("");
    setPw("");
    setPw2("");
  }

  async function startTotpEnrollment() {
    setBusy(true);
    setMfaError("");
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Rating Guard authenticator",
      });
      if (error) throw error;
      setPendingFactor({
        id: data.id,
        type: "totp",
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setMfaCode("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not start authenticator setup.";
      setMfaError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function startPhoneEnrollment(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMfaError("");
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "phone",
        phone: phoneToEnroll.trim(),
        friendlyName: "Rating Guard SMS",
      });
      if (error) throw error;
      const challenge = await supabase.auth.mfa.challenge({
        factorId: data.id,
        channel: "sms",
      });
      if (challenge.error) throw challenge.error;
      setPendingFactor({
        id: data.id,
        type: "phone",
        challengeId: challenge.data.id,
      });
      setMfaCode("");
      toast.success("SMS verification code sent.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not send SMS verification. Check Supabase phone MFA configuration.";
      setMfaError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyFactor(e: FormEvent) {
    e.preventDefault();
    if (!pendingFactor || !/^\d{6,8}$/.test(mfaCode)) {
      toast.error("Enter the verification code from your authenticator or SMS.");
      return;
    }
    setBusy(true);
    try {
      const result =
        pendingFactor.type === "totp"
          ? await supabase.auth.mfa.challengeAndVerify({
              factorId: pendingFactor.id,
              code: mfaCode,
            })
          : await supabase.auth.mfa.verify({
              factorId: pendingFactor.id,
              challengeId: pendingFactor.challengeId!,
              code: mfaCode,
            });
      if (result.error) throw result.error;
      setPendingFactor(null);
      setMfaCode("");
      toast.success("Multi-factor authentication is enabled.");
      await refreshFactors();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "MFA verification failed.");
    } finally {
      setBusy(false);
    }
  }

  async function removeFactor(factor: MfaFactor) {
    if (!window.confirm(`Remove ${factor.friendly_name ?? factor.factor_type} from your account?`))
      return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw error;
      toast.success("Authentication factor removed.");
      await refreshFactors();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove factor.");
    } finally {
      setBusy(false);
    }
  }

  async function createRecoveryCodes() {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.recoveryCodes.generate({
        friendlyName: "Rating Guard recovery codes",
      });
      if (error) throw error;
      setRecoveryCodes(data.codes);
      setRecoveryRemaining(data.total);
      toast.success("Save these codes now. They are shown only once.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not generate recovery codes.";
      setMfaError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function logoutEverywhere() {
    if (!window.confirm("Sign out this account from all active sessions?")) return;
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.cancelQueries();
    qc.clear();
    navigate({ to: "/auth", replace: true });
  }

  if (profileError)
    return (
      <p role="alert" className="text-risk-high">
        {profileError.message}
      </p>
    );
  if (isLoading || !p) return <div className="text-muted-foreground">Loading profile…</div>;

  const verifiedFactors = factors.filter((factor) => factor.status === "verified");
  const verifiedAuthenticators = verifiedFactors.filter(
    (factor) => factor.factor_type === "totp" || factor.factor_type === "phone",
  );
  const pendingTotp = pendingFactor?.type === "totp";

  return (
    <>
      <PageHeader title="Profile & Security" subtitle={APP_DOMAIN} />
      <div className="surface mb-6 flex flex-wrap items-center gap-5 p-6">
        <div className="relative">
          <Avatar name={p.name} url={p.avatarUrl} size={72} />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            aria-label="Change profile photo"
            className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-lift)] disabled:opacity-60"
          >
            <Camera className="h-4 w-4" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadPhoto(file);
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xl font-bold">{p.name}</div>
          <div className="break-all text-sm text-muted-foreground">{p.email}</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => document.getElementById("profile-information")?.scrollIntoView()}
          >
            Edit profile
          </Button>
        </div>
        <div className="text-sm text-muted-foreground">
          Last sign-in: {p.lastLogin ? new Date(p.lastLogin).toLocaleString() : "Unavailable"}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form id="profile-information" onSubmit={savePersonal} className="surface space-y-4 p-6">
          <h2 className="font-semibold">Profile information</h2>
          <div className="space-y-2">
            <Label htmlFor="p-name">Full name</Label>
            <Input id="p-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-user">Username</Label>
            <Input
              id="p-user"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-email">Email</Label>
            <Input
              id="p-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {p.pendingEmail && (
              <p className="text-xs text-risk-medium">Pending confirmation: {p.pendingEmail}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-phone">Phone number</Label>
            <Input
              id="p-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-company">Company name</Label>
            <Input
              id="p-company"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-business-type">Business type</Label>
            <Input
              id="p-business-type"
              value={businessType}
              onChange={(event) => setBusinessType(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy}>
            Save profile
          </Button>
        </form>

        <div className="space-y-6">
          <form onSubmit={changePw} className="surface space-y-4 p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <KeyRound className="size-4" /> Password
            </h2>
            <div className="space-y-2">
              <Label htmlFor="c-pw">Current password</Label>
              <Input
                id="c-pw"
                type="password"
                autoComplete="current-password"
                value={cur}
                onChange={(event) => setCur(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="n-pw">New password</Label>
              <Input
                id="n-pw"
                type="password"
                autoComplete="new-password"
                value={pw}
                onChange={(event) => setPw(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="n-pw2">Confirm new password</Label>
              <Input
                id="n-pw2"
                type="password"
                autoComplete="new-password"
                value={pw2}
                onChange={(event) => setPw2(event.target.value)}
                required
              />
            </div>
            <Button type="submit">Update password</Button>
          </form>

          <section className="surface space-y-4 p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-4" /> Two-factor authentication
            </h2>
            <p className="text-sm text-muted-foreground">
              {verifiedAuthenticators.length
                ? `${verifiedAuthenticators.length} verified authentication factor(s) enabled.`
                : "No verified second factor is enrolled."}{" "}
              Configure and verify a factor before relying on it.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={startTotpEnrollment}>
                Set up authenticator
              </Button>
            </div>
            {factors.map((factor) => (
              <div
                key={factor.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <span>
                  {factor.factor_type === "totp"
                    ? "Authenticator app"
                    : factor.factor_type === "phone"
                      ? `SMS${factor.phone ? ` · ${factor.phone}` : ""}`
                      : factor.factor_type === "webauthn"
                        ? "Security key"
                        : "Recovery codes"}
                  {factor.friendly_name ? ` (${factor.friendly_name})` : ""}
                  {factor.status !== "verified" ? " · Not verified" : ""}
                </span>
                {factor.factor_type !== "recovery_code" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void removeFactor(factor)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
            {pendingTotp && pendingFactor && (
              <form onSubmit={verifyFactor} className="space-y-3 rounded-lg border p-4">
                <p className="text-sm font-medium">Scan this QR code with your authenticator app</p>
                {pendingFactor.qrCode && (
                  <img src={pendingFactor.qrCode} alt="Authenticator enrollment QR code" />
                )}
                <p className="break-all text-xs text-muted-foreground">
                  Manual setup key: {pendingFactor.secret}
                </p>
                <Label htmlFor="totp-code">6-digit authenticator code</Label>
                <Input
                  id="totp-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value)}
                  required
                />
                <div className="flex gap-2">
                  <Button type="submit" disabled={busy}>
                    Verify and enable
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setPendingFactor(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
            {pendingFactor?.type === "phone" && (
              <form onSubmit={verifyFactor} className="space-y-3 rounded-lg border p-4">
                <p className="text-sm">Enter the SMS code sent to {phoneToEnroll}.</p>
                <Label htmlFor="sms-mfa-code">SMS verification code</Label>
                <Input
                  id="sms-mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value)}
                  required
                />
                <Button type="submit" disabled={busy}>
                  Verify SMS factor
                </Button>
              </form>
            )}
            {!factors.some(
              (factor) => factor.factor_type === "phone" && factor.status !== "verified",
            ) && (
              <form onSubmit={startPhoneEnrollment} className="space-y-3 border-t pt-4">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <Smartphone className="size-4" /> SMS second factor
                </h3>
                <Label htmlFor="mfa-phone">Phone number in international format</Label>
                <Input
                  id="mfa-phone"
                  type="tel"
                  placeholder="+15551234567"
                  autoComplete="tel"
                  value={phoneToEnroll || phone}
                  onChange={(event) => setPhoneToEnroll(event.target.value)}
                  required
                />
                <Button type="submit" variant="outline" disabled={busy}>
                  Send SMS code
                </Button>
              </form>
            )}
            {mfaError && (
              <p role="alert" className="text-sm text-risk-high">
                {mfaError}
              </p>
            )}
          </section>

          <section className="surface space-y-4 p-6">
            <h2 className="font-semibold">Recovery codes</h2>
            <p className="text-sm text-muted-foreground">
              One-time codes are managed by Supabase Auth and shown only when generated.
              {recoveryRemaining !== null ? ` ${recoveryRemaining} code(s) remain.` : ""}
            </p>
            {recoveryCodes.length > 0 && (
              <div className="space-y-2 rounded-lg border p-4">
                <p className="text-sm font-semibold">Save these codes somewhere secure now</p>
                <code className="grid grid-cols-2 gap-2 text-sm">
                  {recoveryCodes.map((code) => (
                    <span key={code}>{code}</span>
                  ))}
                </code>
                <Button type="button" variant="outline" onClick={() => setRecoveryCodes([])}>
                  Hide codes
                </Button>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={busy || verifiedAuthenticators.length === 0}
              onClick={() => void createRecoveryCodes()}
            >
              {recoveryRemaining ? "Regenerate recovery codes" : "Generate recovery codes"}
            </Button>
          </section>

          <section className="surface space-y-3 p-6">
            <h2 className="font-semibold">Sessions &amp; sign-in activity</h2>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Clock3 className="size-4" /> Last successful sign-in
              </span>
              <span>{p.lastLogin ? new Date(p.lastLogin).toLocaleString() : "Unavailable"}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Supabase Auth does not expose a device/session list or full login history to this
              browser client. This page shows the account’s last sign-in only.
            </p>
            <Button type="button" variant="outline" onClick={() => void logoutEverywhere()}>
              <LogOut /> Sign out all devices
            </Button>
          </section>
        </div>

        <form onSubmit={savePersonal} className="surface space-y-4 p-6 lg:col-span-2">
          <h2 className="font-semibold">Preferences</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-3 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={emailNotifications}
                onChange={(event) => setEmailNotifications(event.target.checked)}
              />
              Email notifications
            </label>
            <div className="space-y-2">
              <Label htmlFor="p-language">Language</Label>
              <select
                id="p-language"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-timezone">Timezone</Label>
              <Input
                id="p-timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                placeholder="Asia/Kolkata"
              />
            </div>
          </div>
          <Button type="submit" disabled={busy}>
            Save preferences
          </Button>
        </form>
      </div>
    </>
  );
}
