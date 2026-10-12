import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import scanIcon from "@/assets/icon-scan.png";
import reportIcon from "@/assets/icon-report.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Rating Guard Remix" },
      { name: "description", content: "Secure account sign in for Rating Guard Remix." },
      { property: "og:title", content: "Sign in — Rating Guard Remix" },
      { property: "og:description", content: "Secure account sign in for Rating Guard Remix." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const SLIDES = [
  {
    img: scanIcon,
    title: (
      <>
        Scan every review.
        <br />
        <span className="text-gradient">Spot the risk.</span>
      </>
    ),
    body: "Paste a Google Maps link and get the rating, available reviews and a clear policy-risk classification in seconds.",
  },
  {
    img: reportIcon,
    title: (
      <>
        Evidence-ready
        <br />
        <span className="text-gradient">reports.</span>
      </>
    ),
    body: "Every finding comes with its reason, the exact evidence and a confidence score — ready for Google's official reporting path.",
  },
];

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  const [mode, setMode] = useState<"login" | "signup" | "reset" | "recovery">("login");
  const [notice, setNotice] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  useEffect(() => {
    const recovery = new URLSearchParams(window.location.search).get("flow") === "recovery";
    const callbackError =
      new URLSearchParams(window.location.hash.slice(1)).get("error_description") ??
      new URLSearchParams(window.location.search).get("error_description");
    if (callbackError) setError(callbackError);
    if (recovery) setMode("recovery");
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setMode("recovery");
      else if (event === "SIGNED_IN" && session && !recovery) {
        void navigate({ to: "/dashboard", replace: true });
      }
    });
    void supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (sessionError) setError(sessionError.message);
        else if (data.session && !recovery) void navigate({ to: "/dashboard", replace: true });
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error ? cause.message : "Could not restore your session. Sign in again.",
        );
      });
    return () => listener.subscription.unsubscribe();
  }, [navigate]);
  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 5000);
    return () => clearInterval(t);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const redirect = `${window.location.origin}/auth`;
      if (mode === "reset") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${redirect}?flow=recovery`,
        });
        if (resetError) throw resetError;
        setNotice("If an account exists for this email, a password reset link has been sent.");
      } else if (mode === "recovery") {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!data.session)
          throw new Error(
            "This reset link is invalid or expired. Request a new password reset link.",
          );
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        await navigate({ to: "/dashboard", replace: true });
      } else if (mode === "signup") {
        const { data, error: signupError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: redirect },
        });
        if (signupError) throw signupError;
        if (data.session) await navigate({ to: "/dashboard", replace: true });
        else setNotice("Check your email to verify your account, then sign in.");
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (loginError) {
          setNeedsConfirmation(
            loginError.code === "email_not_confirmed" ||
              loginError.message === "Email not confirmed",
          );
          throw loginError;
        }
        await navigate({ to: "/dashboard", replace: true });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function changeMode(next: typeof mode) {
    setMode(next);
    setPassword("");
    setError(null);
    setNotice(null);
    setNeedsConfirmation(false);
  }
  async function resendConfirmation() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth` },
      });
      if (result.error) throw result.error;
      setNotice(
        "Confirmation requested. Check your inbox and spam folder, then open the verification link before signing in.",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not resend confirmation.");
    } finally {
      setBusy(false);
    }
  }
  const s = SLIDES[slide]!;
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="bg-scanner relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="grid-lines absolute inset-0" />
        <Link to="/" className="relative flex items-center gap-3 font-display text-lg font-bold">
          <img src="/logo.svg" alt="" width={40} height={40} className="size-10" /> The Rating{" "}
          <span className="text-gradient">Guard</span>
        </Link>
        <div key={slide} className="animate-slide-in relative">
          <img
            src={s.img}
            alt=""
            width={220}
            height={220}
            className="icon-3d animate-float mb-8 w-52"
          />
          <h1 className="text-5xl font-bold leading-[1.1]">{s.title}</h1>
          <p className="mt-5 max-w-md text-muted-foreground">{s.body}</p>
        </div>
        <div className="relative flex items-center gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              aria-label={`Slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === slide ? "w-10 bg-aqua" : "w-4 bg-muted-foreground/40"}`}
            />
          ))}
          <span className="ml-auto text-xs text-muted-foreground">ratingguard.online</span>
        </div>
      </div>

      <div className="relative flex items-center justify-center p-6">
        <div className="absolute size-80 rounded-full bg-primary/15 blur-3xl" />
        <form
          onSubmit={submit}
          className="glass neon-outline relative w-full max-w-sm space-y-5 rounded-3xl p-8"
        >
          <img
            src="/logo.svg"
            alt=""
            width={56}
            height={56}
            className="mx-auto size-14 lg:hidden"
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Rating Guard Remix
            </p>
            <h2 className="mt-2 text-3xl font-bold">
              {mode === "signup"
                ? "Create your account"
                : mode === "reset"
                  ? "Reset password"
                  : mode === "recovery"
                    ? "Set a new password"
                    : "Welcome back"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "login"
                ? "Sign in to your command center."
                : mode === "signup"
                  ? "Use your email to create a secure account."
                  : "Use the emailed recovery link to reset your password."}
            </p>
          </div>
          {mode !== "recovery" && (
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 pl-9"
                  placeholder="you@company.com"
                />
              </div>
            </div>
          )}
          {mode !== "reset" && (
            <div className="space-y-2">
              <Label htmlFor="pw">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="pw"
                  type={show ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  minLength={mode === "login" ? undefined : 8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 px-9"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-risk-high-soft px-3 py-2 text-sm text-risk-high"
            >
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm">
              {notice}
            </p>
          )}
          {needsConfirmation && mode === "login" && (
            <Button
              type="button"
              variant="outline"
              disabled={busy || !email.trim()}
              onClick={resendConfirmation}
            >
              Resend confirmation email
            </Button>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? (
              "Please wait…"
            ) : (
              <>
                {mode === "signup"
                  ? "Create account"
                  : mode === "reset"
                    ? "Send reset link"
                    : mode === "recovery"
                      ? "Save new password"
                      : "Sign in"}{" "}
                <ArrowRight />
              </>
            )}
          </Button>
          <div className="flex flex-wrap justify-between gap-3 text-sm">
            <button
              type="button"
              disabled={busy}
              onClick={() => changeMode(mode === "login" ? "signup" : "login")}
              className="text-primary hover:underline"
            >
              {mode === "login" ? "Create account" : "Back to sign in"}
            </button>
            {mode === "login" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => changeMode("reset")}
                className="text-primary hover:underline"
              >
                Forgot password?
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
