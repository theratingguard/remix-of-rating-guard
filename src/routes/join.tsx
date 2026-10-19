import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ArrowRight, KeyRound, Mail, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/join")({
  validateSearch: (search: Record<string, unknown>) => ({
    ref: typeof search["ref"] === "string" ? search["ref"].slice(0, 32) : "",
  }),
  component: JoinPage,
});

function JoinPage() {
  const { ref } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState(ref.toUpperCase());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = referralCode.trim().toUpperCase();
    if (code && !/^RG-[A-Z0-9]{10}$/.test(code)) {
      setError("Enter a valid reseller referral code or leave the field blank.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { data, error: signupError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          data: { account_type: "client", ...(code ? { referral_code: code } : {}) },
        },
      });
      if (signupError) throw signupError;
      if (data.session) {
        await navigate({ to: "/client/dashboard", replace: true });
      } else {
        setNotice(
          "Account request received. Verify your email, then sign in to open your client portal.",
        );
      }
    } catch {
      setError(
        "We could not create the account. Check the referral code and details, then try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-xl sm:p-8">
        <div className="mb-7 text-center">
          <img src="/logo.svg" alt="" width={52} height={52} className="mx-auto size-13" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Rating Guard
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold">Create your client account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a direct client account, or add a reseller referral code if you have one.
          </p>
        </div>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="join-email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="join-email"
                type="email"
                autoComplete="email"
                required
                maxLength={320}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="pl-9"
                placeholder="you@company.com"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="join-referral">Reseller referral code (optional)</Label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="join-referral"
                minLength={referralCode ? 13 : undefined}
                maxLength={13}
                value={referralCode}
                onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
                className="pl-9 font-mono tracking-wider"
                placeholder="RG-XXXXXXXXXX"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="join-password">Password</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="join-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">
              {notice}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? (
              "Creating account…"
            ) : (
              <>
                Create account <ArrowRight />
              </>
            )}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link className="font-medium text-primary hover:underline" to="/auth">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
