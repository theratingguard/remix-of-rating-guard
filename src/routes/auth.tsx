import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import shield from "@/assets/icon-shield.png";
import scanIcon from "@/assets/icon-scan.png";
import reportIcon from "@/assets/icon-report.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — The Rating Guard" },
      { name: "description", content: "Super admin sign in for The Rating Guard review intelligence platform." },
      { property: "og:title", content: "Sign in — The Rating Guard" },
      { property: "og:description", content: "Super admin sign in for The Rating Guard review intelligence platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const SLIDES = [
  { img: scanIcon, title: <>Scan every review.<br /><span className="text-gradient">Spot the risk.</span></>, body: "Paste a Google Maps link and get the rating, available reviews and a clear policy-risk classification in seconds." },
  { img: reportIcon, title: <>Evidence-ready<br /><span className="text-gradient">reports.</span></>, body: "Every finding comes with its reason, the exact evidence and a confidence score — ready for Google's official reporting path." },
];

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) navigate({ to: "/dashboard", replace: true }); });
  }, [navigate]);
  useEffect(() => { const t = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 5000); return () => clearInterval(t); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) { setError("Invalid username or password."); return; }
    navigate({ to: "/dashboard" });
  }

  const s = SLIDES[slide]!;
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="bg-scanner relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="grid-lines absolute inset-0" />
        <Link to="/" className="relative flex items-center gap-3 font-display text-lg font-bold">
          <img src={shield} alt="" width={40} height={40} className="icon-3d size-10" /> The Rating <span className="text-gradient">Guard</span>
        </Link>
        <div key={slide} className="animate-slide-in relative">
          <img src={s.img} alt="" width={220} height={220} className="icon-3d animate-float mb-8 w-52" />
          <h1 className="text-5xl font-bold leading-[1.1]">{s.title}</h1>
          <p className="mt-5 max-w-md text-muted-foreground">{s.body}</p>
        </div>
        <div className="relative flex items-center gap-2">
          {SLIDES.map((_, i) => (
            <button key={i} onClick={() => setSlide(i)} aria-label={`Slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === slide ? "w-10 bg-aqua" : "w-4 bg-muted-foreground/40"}`} />
          ))}
          <span className="ml-auto text-xs text-muted-foreground">theratingguard.com</span>
        </div>
      </div>

      <div className="relative flex items-center justify-center p-6">
        <div className="absolute size-80 rounded-full bg-primary/15 blur-3xl" />
        <form onSubmit={submit} className="glass neon-outline relative w-full max-w-sm space-y-5 rounded-3xl p-8">
          <img src={shield} alt="" width={56} height={56} className="icon-3d mx-auto size-14 lg:hidden" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Super Admin</p>
            <h2 className="mt-2 text-3xl font-bold">Welcome back</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to your command center.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Username / Email</Label>
            <div className="relative"><Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 pl-9" placeholder="you@company.com" /></div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw">Password</Label>
            <div className="relative"><Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="pw" type={show ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 px-9" placeholder="••••••••" />
              <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
            </div>
          </div>
          {error && <p role="alert" className="rounded-lg bg-risk-high-soft px-3 py-2 text-sm text-risk-high">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "Signing in…" : <>Sign in <ArrowRight /></>}</Button>
        </form>
      </div>
    </div>
  );
}
