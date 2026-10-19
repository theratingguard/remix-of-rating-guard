import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  BriefcaseBusiness,
  Check,
  CircleDollarSign,
  Eye,
  FileText,
  Flag,
  Lock,
  MessageSquareText,
  ScanSearch,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { DEFAULT_CONTENT, type SiteContent } from "@/lib/site-content";

const SCAN_STAGES = [
  "Review received",
  "Scanning...",
  "Evidence found",
  "Report prepared",
  "Ready for Google review",
];

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 motion-reduce:transition-none ${on ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
}

function HeroScanCard() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStage((current) => (current + 1) % SCAN_STAGES.length);
    }, 1600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div
        aria-hidden="true"
        className="absolute -inset-8 rounded-[2.5rem] bg-emerald-400/15 blur-3xl"
      />
      <div className="absolute -inset-px rounded-[2rem] bg-gradient-to-br from-emerald-300/50 via-emerald-400/10 to-teal-200/30 opacity-80 blur-sm" />
      <div className="relative overflow-hidden rounded-[2rem] border border-white/20 bg-[#0b1712]/80 p-5 shadow-[0_24px_90px_rgba(16,185,129,0.16)] backdrop-blur-2xl sm:p-7">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-emerald-300/[0.09] to-transparent"
        />
        <div className="relative flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-300">
            <ScanSearch className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Example Reviewer</p>
            <div className="mt-1 flex items-center gap-0.5 text-amber-300">
              {Array.from({ length: 5 }, (_, i) => (
                <Star
                  key={i}
                  aria-hidden="true"
                  className={`size-3.5 ${i === 0 ? "fill-current" : "opacity-30"}`}
                />
              ))}
              <span className="ml-1.5 text-[10px] text-slate-400">Example review</span>
            </div>
          </div>
          <span className="ml-auto rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-slate-300">
            Live scan demo
          </span>
        </div>

        <div className="relative mt-5 overflow-hidden rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="absolute inset-x-0 top-0 h-px animate-sweep bg-gradient-to-r from-transparent via-emerald-300 to-transparent motion-reduce:animate-none" />
          <p className="text-sm leading-relaxed text-slate-200">
            Terrible place.{" "}
            <span
              className={`rounded px-1 transition-colors duration-500 ${
                stage >= 2 ? "bg-amber-300/15 text-amber-100 ring-1 ring-amber-300/20" : ""
              }`}
            >
              Go to BestCleaners.com instead...
            </span>
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
            <AlertTriangle
              className={`size-3.5 transition-colors ${
                stage >= 2 ? "text-amber-300" : "text-slate-500"
              }`}
            />
            Potential policy signal — example only
          </div>
        </div>

        <ol aria-label="Example scan progress" className="mt-5 space-y-2.5">
          {SCAN_STAGES.map((step, index) => {
            const complete = index < stage;
            const current = index === stage;
            return (
              <li
                key={step}
                aria-current={current ? "step" : undefined}
                className={`flex min-h-7 items-center gap-2.5 text-xs transition-all duration-500 ${
                  current ? "text-white" : complete ? "text-emerald-200/80" : "text-slate-500"
                }`}
              >
                <span
                  className={`grid size-5 shrink-0 place-items-center rounded-full border transition-all duration-500 ${
                    complete
                      ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-300"
                      : current
                        ? "animate-pulse border-emerald-300/60 bg-emerald-300/20 text-emerald-200"
                        : "border-white/10 bg-white/[0.03] text-slate-600"
                  }`}
                >
                  {index === 2 ? (
                    <AlertTriangle className="size-3" />
                  ) : complete ? (
                    <Check className="size-3" />
                  ) : (
                    <span className="size-1 rounded-full bg-current" />
                  )}
                </span>
                <span>{step}</span>
                {current && (
                  <span className="ml-auto flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
                    <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" />
                    In progress
                  </span>
                )}
                {index === 2 && stage >= 2 && (
                  <span className="ml-auto rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                    Potential signal
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-5 border-t border-white/10 pt-4 text-[11px] leading-relaxed text-slate-400">
          AI-assisted evidence is prepared for your review. Nothing is sent automatically; Google
          makes the final decision.
        </p>
      </div>
    </div>
  );
}

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight drop-shadow-[0_0_18px_rgba(16,185,129,0.12)] md:text-4xl">
        {title}
      </h2>
      {body && <p className="mt-4 text-muted-foreground md:text-lg">{body}</p>}
    </Reveal>
  );
}

export function HomePage({ c, preview }: { c: SiteContent; preview?: boolean }) {
  const faq = c.faq.filter((f) => f.visible);
  const heroTitle =
    c.heroTitle === "The review you want gone. Start with the evidence." ||
    c.heroTitle === "Understand Your Google Reviews. Protect Your Reputation."
      ? DEFAULT_CONTENT.heroTitle
      : c.heroTitle;
  const heroSubtitle =
    c.heroSubtitle ===
      "Understand which reviews may raise a policy concern, see the evidence clearly, and decide on a responsible next step. Google makes every final decision." ||
    c.heroSubtitle ===
      "Identify potentially policy-relevant reviews, understand why they need attention, and take evidence-based action aligned with Google's policies."
      ? DEFAULT_CONTENT.heroSubtitle
      : c.heroSubtitle;
  const heroTitleParts = heroTitle.split(". ");
  return (
    <div className="min-h-screen scroll-smooth overflow-x-clip bg-background text-foreground">
      {preview && (
        <div className="bg-risk-medium/20 py-2 text-center text-sm font-medium">
          Draft preview — not yet published
        </div>
      )}
      {c.announcement && (
        <div className="bg-primary py-2 text-center text-sm text-primary-foreground">
          {c.announcement}
        </div>
      )}

      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07110d]/90 text-white backdrop-blur-xl">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex min-h-16 max-w-7xl items-center gap-2 px-3 sm:gap-3 sm:px-6"
        >
          <a href="#top" className="flex shrink-0 items-center gap-2.5 font-semibold">
            <span className="grid size-9 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-300">
              <ShieldCheck className="size-5" />
            </span>
            <span className="hidden font-display text-sm min-[360px]:inline sm:text-base">
              The Rating <span className="text-emerald-300">Guard</span>
            </span>
          </a>
          <div className="ml-auto hidden items-center gap-7 text-sm text-slate-300 md:flex">
            <a href="#how" className="transition hover:text-white">
              Process
            </a>
            <a href="#comparison" className="transition hover:text-white">
              Approach
            </a>
            <a href="#faq" className="transition hover:text-white">
              FAQ
            </a>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 md:ml-0 sm:gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="border-white/20 px-2 text-[10px] sm:px-3 sm:text-xs"
            >
              <Link to="/auth">Login</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="px-2 text-[10px] shadow-[0_0_18px_rgba(16,185,129,0.16)] transition-shadow hover:shadow-[0_0_28px_rgba(16,185,129,0.3)] sm:px-3 sm:text-xs"
            >
              <Link to="/get-started">Get Started</Link>
            </Button>
          </div>
        </nav>
      </header>

      <main id="top">
        <section className="relative isolate overflow-hidden bg-[#07110d] text-white">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute -right-32 -top-48 size-[38rem] rounded-full bg-emerald-500/10 blur-[130px]" />
            <div className="absolute -bottom-64 left-1/4 size-[36rem] rounded-full bg-teal-500/10 blur-[140px]" />
          </div>
          <div className="mx-auto grid min-h-[calc(88svh-4rem)] max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:py-24">
            <Reveal>
              <p className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/5 px-3 py-1.5 text-xs font-medium text-emerald-200">
                <ShieldCheck className="size-3.5" />
                Evidence-led support for businesses
              </p>
              <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight drop-shadow-[0_0_26px_rgba(52,211,153,0.14)] sm:text-5xl lg:text-6xl xl:text-7xl">
                {heroTitleParts.length > 1 ? `${heroTitleParts[0]}.` : heroTitle}
                {heroTitleParts.length > 1 && (
                  <span className="mt-1 block bg-gradient-to-r from-emerald-200 via-emerald-400 to-teal-300 bg-clip-text text-transparent drop-shadow-[0_0_26px_rgba(52,211,153,0.2)]">
                    {heroTitleParts.slice(1).join(". ")}
                  </span>
                )}
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
                {heroSubtitle}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button
                  asChild
                  size="lg"
                  className="shadow-[0_0_24px_rgba(16,185,129,0.22)] transition-shadow hover:shadow-[0_0_34px_rgba(16,185,129,0.38)]"
                >
                  <Link to="/contact">
                    Contact Us Now <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                >
                  <a href="#how">See How It Works</a>
                </Button>
              </div>
              <p className="mt-5 text-xs text-slate-400">
                Evidence-led review support. Google makes the final decision on every report.
              </p>
            </Reveal>
            <Reveal delay={150}>
              <HeroScanCard />
            </Reveal>
          </div>
        </section>

        <section
          aria-label="Ways to work with Rating Guard"
          className="mx-auto grid max-w-7xl gap-3 px-4 py-6 sm:px-6 sm:py-8 md:grid-cols-3"
        >
          {[
            {
              icon: AlertTriangle,
              title: "Challenge harmful reviews",
              detail: "Prepare an evidence-led report for Google's independent review.",
            },
            {
              icon: ShieldCheck,
              title: "Protect your reputation",
              detail: "Understand the reviews available for your business and what they say.",
            },
            {
              icon: BarChart3,
              title: "Build trust with feedback",
              detail: "Use review insights to support better customer experiences.",
            },
          ].map(({ icon: Icon, title, detail }, index) => (
            <Reveal key={title} delay={index * 110}>
              <article className="group flex h-full gap-3 rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.07] to-card p-4 shadow-[0_8px_30px_rgba(16,185,129,0.04)] transition duration-300 hover:-translate-y-1 hover:border-emerald-400/35 hover:shadow-[0_12px_38px_rgba(16,185,129,0.12)] sm:p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/10 text-primary transition duration-300 group-hover:shadow-[0_0_18px_rgba(16,185,129,0.25)]">
                  <Icon className="size-5" />
                </span>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">{title}</span>
                  <span className="mt-1 block">{detail}</span>
                </p>
              </article>
            </Reveal>
          ))}
        </section>

        <section aria-label="Our principles" className="border-b border-card-border bg-card/50">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-6 text-xs font-medium text-muted-foreground sm:px-6 sm:text-sm md:grid-cols-4">
            {[
              [BadgeCheck, "Evidence-based"],
              [ShieldCheck, "Policy-aware"],
              [Sparkles, "AI-assisted"],
              [Eye, "Human-controlled"],
            ].map(([I, text]) => {
              const Icon = I as typeof BadgeCheck;
              return (
                <div key={text as string} className="flex items-center justify-center gap-2">
                  <Icon className="size-4 text-primary" />
                  {text as string}
                </div>
              );
            })}
          </div>
        </section>

        <section id="paths" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20">
          <SectionHead
            eyebrow="For teams and businesses"
            title="One platform. Three ways to get involved."
            body="Choose the path that fits you. Each next step uses the appropriate existing application or contact flow."
          />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <Reveal className="group rounded-3xl border border-card-border bg-card p-6 transition hover:-translate-y-1 hover:border-primary/40 sm:p-8">
              <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <CircleDollarSign className="size-6" />
              </span>
              <h3 className="mt-5 text-xl font-semibold">Join as a Reseller</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                White-label review intelligence for agencies. Earn commissions on eligible
                referrals; contact us to discuss partner terms.
              </p>
              <Button asChild variant="link" className="mt-4 h-auto p-0">
                <Link to="/contact">
                  Ask about partnering <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
            </Reveal>
            <Reveal
              delay={100}
              className="group rounded-3xl border border-card-border bg-card p-6 transition hover:-translate-y-1 hover:border-primary/40 sm:p-8"
            >
              <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <BriefcaseBusiness className="size-6" />
              </span>
              <h3 className="mt-5 text-xl font-semibold">Business Owner</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Track your Google Business Profile and review insights. New client accounts
                currently require a reseller referral code.
              </p>
              <Button asChild variant="link" className="mt-4 h-auto p-0">
                <Link to="/join" search={{ ref: "" }}>
                  Create a client account <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
            </Reveal>
            <Reveal
              delay={200}
              className="group rounded-3xl border border-card-border bg-card p-6 transition hover:-translate-y-1 hover:border-primary/40 sm:p-8"
            >
              <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <BadgeCheck className="size-6" />
              </span>
              <h3 className="mt-5 text-xl font-semibold">Join as Staff</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Apply to join the review operations team and support evidence-led case handling.
              </p>
              <Button asChild variant="link" className="mt-4 h-auto p-0">
                <Link to="/staff/register">
                  Start a staff application <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
            </Reveal>
          </div>
        </section>

        <section
          id="comparison"
          className="scroll-mt-24 border-y border-card-border bg-secondary/30 py-16 sm:py-20"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHead
              eyebrow="A more considered approach"
              title="Evidence over empty promises."
              body="Review management should be clear about what can be assessed—and who controls the outcome."
            />
            <div className="mx-auto mt-10 max-w-4xl overflow-hidden rounded-2xl border border-card-border bg-card">
              <div className="grid grid-cols-[1fr_1fr] bg-muted/50 sm:grid-cols-[1.15fr_1fr_1fr]">
                <div className="hidden p-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:block">
                  What matters
                </div>
                <div className="p-4 text-sm font-semibold text-muted-foreground">
                  Ad hoc process
                </div>
                <div className="border-l border-card-border p-4 text-sm font-semibold text-primary">
                  Rating Guard
                </div>
              </div>
              {[
                ["Review context", "Manual review", "Structured analysis"],
                ["Evidence trail", "Collected separately", "Shown with each finding"],
                ["Reporting", "Varies by workflow", "Organized scan reports"],
                ["Final decision", "Always Google", "Always Google"],
                ["Outcome promises", "Be cautious of guarantees", "No removal guarantees"],
              ].map(([item, other, ratingGuard]) => (
                <div
                  key={item}
                  className="grid grid-cols-[1fr_1fr] border-t border-card-border sm:grid-cols-[1.15fr_1fr_1fr]"
                >
                  <div className="col-span-2 px-4 pt-3 text-xs font-semibold text-foreground sm:col-span-1 sm:py-4 sm:text-sm">
                    {item}
                  </div>
                  <div className="px-4 pb-3 text-sm text-muted-foreground sm:py-4">{other}</div>
                  <div className="border-l border-card-border px-4 pb-3 text-sm text-foreground sm:py-4">
                    {ratingGuard}
                  </div>
                </div>
              ))}
              <p className="border-t border-card-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                Comparison describes workflow differences, not guaranteed results. No success-rate
                claim is made; outcomes depend on Google’s independent review.
              </p>
            </div>
          </div>
        </section>

        {c.sections.problem && (
          <section className="mx-auto max-w-6xl px-4 py-20">
            <SectionHead
              eyebrow="The problem"
              title="Not Every Bad Review Is a Policy Violation."
              body="A negative review can be completely legitimate. We keep negative feedback and potential policy risk apart, so you only act where it's justified."
            />
            <div className="mt-12 grid items-center gap-6 md:grid-cols-[1fr_auto_1fr]">
              <Reveal className="surface p-6 text-center">
                <div className="text-5xl font-extrabold">
                  4.7<span className="text-star">★</span>
                </div>
                <p className="mt-2 font-semibold">Business rating</p>
                <p className="text-sm text-muted-foreground">How customers feel overall</p>
              </Reveal>
              <div className="text-center text-2xl font-bold text-muted-foreground">+</div>
              <Reveal delay={120} className="surface p-6 text-center">
                <div className="text-5xl font-extrabold text-risk-high">1</div>
                <p className="mt-2 font-semibold">Potentially risky review</p>
                <p className="text-sm text-muted-foreground">
                  A separate question: does it break a policy?
                </p>
              </Reveal>
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">Illustrative example</p>
          </section>
        )}

        {c.sections.responsible && (
          <section id="responsible" className="bg-sidebar py-20 text-sidebar-foreground">
            <div className="mx-auto max-w-6xl px-4">
              <Reveal className="mx-auto max-w-2xl text-center">
                <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                  Don't Risk Your Google Presence for a Quick Fix.
                </h2>
                <p className="mt-4 opacity-80">
                  Some services use artificial engagement, fake reporting, review manipulation or
                  spam networks. Those approaches can create unnecessary long-term risk. Our
                  approach is designed to reduce unnecessary policy risk.
                </p>
                <p className="mt-4 text-sm opacity-70">{c.trustStatement}</p>
              </Reveal>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                {[
                  "Real Data",
                  "Evidence",
                  "Policy Awareness",
                  "Transparent Analysis",
                  "Responsible Actions",
                ].map((t, i) => (
                  <Reveal key={t} delay={i * 80}>
                    <span className="inline-flex items-center gap-2 rounded-full border border-sidebar-border px-4 py-2 text-sm">
                      <BadgeCheck className="size-4 text-risk-normal" />
                      {t}
                    </span>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        )}

        {c.sections.how && (
          <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
            <SectionHead eyebrow="How it works" title="Five clear steps, from link to action." />
            <ol className="relative mx-auto mt-12 max-w-3xl before:absolute before:bottom-6 before:left-5 before:top-6 before:w-px before:bg-border sm:before:left-7">
              {c.steps.slice(0, 5).map((st, i) => (
                <li key={`${st.title}-${i}`} className="relative pb-5 last:pb-0">
                  <Reveal delay={i * 90} className="flex gap-4 sm:gap-6">
                    <span className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full border border-primary/30 bg-background font-mono text-xs font-semibold text-primary sm:size-14 sm:text-sm">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="surface min-w-0 flex-1 rounded-2xl p-4 sm:p-6">
                      <h3 className="font-semibold">{st.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {st.body}
                      </p>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ol>
          </section>
        )}

        {c.sections.ai && (
          <section className="bg-secondary/40 py-20">
            <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 md:grid-cols-2">
              <Reveal>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                  AI intelligence
                </p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
                  AI That Explains — Not Just Scores.
                </h2>
                <ul className="mt-6 space-y-3 text-muted-foreground">
                  {[
                    "Understands review context",
                    "Identifies potential risk signals",
                    "Explains the evidence",
                    "Suggests professional replies",
                    "Organizes findings",
                  ].map((t) => (
                    <li key={t} className="flex gap-2">
                      <BadgeCheck className="mt-0.5 size-4 shrink-0 text-risk-normal" />
                      {t}
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-sm text-muted-foreground">
                  AI findings are analytical assessments. Google makes the final decision.
                </p>
              </Reveal>
              <Reveal delay={150} className="surface space-y-3 p-6 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Review analysis</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Example
                  </span>
                </div>
                {[
                  [
                    "Risk",
                    <span key="r" className="font-semibold text-risk-high">
                      High
                    </span>,
                  ],
                  ["Reason", "Promotes another business instead of describing an experience."],
                  [
                    "Evidence",
                    <span key="e" className="font-mono text-xs">
                      "Go to BestCleaners.com instead"
                    </span>,
                  ],
                  ["Assessment", "Example signal — human review needed"],
                  [
                    "Suggested action",
                    "Review evidence, then use Google's official reporting path.",
                  ],
                ].map(([k, v]) => (
                  <div
                    key={k as string}
                    className="grid grid-cols-[110px_1fr] gap-2 border-t border-card-border pt-3"
                  >
                    <span className="text-muted-foreground">{k}</span>
                    <span>{v}</span>
                  </div>
                ))}
              </Reveal>
            </div>
          </section>
        )}

        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <Reveal className="flex flex-col gap-6 rounded-3xl border border-primary/20 bg-primary/5 p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                <CircleDollarSign className="size-4" />
                Clear scope, no surprise claims
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                Get the details before you decide.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Pricing is not published on this page. Contact our team for current service details
                and scope; no outcome or review-removal guarantee is offered.
              </p>
            </div>
            <Button asChild className="shrink-0">
              <Link to="/contact">
                Ask about pricing <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </Reveal>
        </section>

        {c.sections.reply && (
          <section className="mx-auto max-w-6xl px-4 py-20">
            <SectionHead
              eyebrow="Reply assistant"
              title="Respond Better to the Reviews That Matter."
              body="Pick a tone and get a professional, editable reply. Nothing is posted automatically — you stay in control."
            />
            <div className="mt-12 grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
              {[
                [Star, "Review", "“Food was cold and nobody checked on us.”"],
                [Sparkles, "AI understanding", "Legitimate service complaint. No policy concern."],
                [
                  MessageSquareText,
                  "Suggested reply",
                  "“We're sorry your visit fell short. We'd love to make it right — please reach out to us directly.”",
                ],
              ].map(([I, t, b], i, arr) => {
                const Icon = I as typeof Star;
                return [
                  <Reveal key={t as string} delay={i * 120} className="surface p-5">
                    <Icon className="size-5 text-primary" />
                    <h3 className="mt-3 font-semibold">{t as string}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{b as string}</p>
                  </Reveal>,
                  i < arr.length - 1 && (
                    <div key={`a${i}`} className="hidden items-center md:flex">
                      <ArrowRight className="text-muted-foreground" />
                    </div>
                  ),
                ];
              })}
            </div>
            <div className="mt-8 text-center">
              <Button asChild variant="outline">
                <a href="#how">See How It Works</a>
              </Button>
            </div>
          </section>
        )}

        {c.sections.reporting && (
          <section id="reporting" className="scroll-mt-20 bg-secondary/40 py-20">
            <div className="mx-auto max-w-6xl px-4">
              <SectionHead
                eyebrow="Reporting"
                title="Turn Review Data Into a Clear Report."
                body="Know what was scanned, what was found, why it matters, and what action may be appropriate."
              />
              <Reveal className="surface mx-auto mt-12 max-w-3xl p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold">
                    <FileText className="size-4 text-primary" /> Review scan report
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Example layout
                  </span>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    ["Business rating", "4.7★", ""],
                    ["Reviews analyzed", "5", ""],
                    ["Potentially risky", "2", "text-risk-medium"],
                    ["High risk", "1", "text-risk-high"],
                    ["Manual review", "1", ""],
                    ["Data quality", "High", "text-risk-normal"],
                  ].map(([k, v, cl]) => (
                    <div key={k} className="rounded-lg border border-card-border p-4">
                      <div className="text-xs text-muted-foreground">{k}</div>
                      <div className={`mt-1 text-2xl font-bold ${cl}`}>{v}</div>
                    </div>
                  ))}
                </div>
              </Reveal>
              <Reveal className="mx-auto mt-12 max-w-3xl text-center">
                <h3 className="text-2xl font-bold">Ready-to-Share Reports.</h3>
                <p className="mt-3 text-muted-foreground">
                  Generate a professional report and send it to your client when <b>you</b> choose.
                  Reports are never sent automatically.
                </p>
                <div className="mt-6 flex items-center justify-center gap-3 text-sm font-medium">
                  <span className="flex items-center gap-1.5">
                    <Search className="size-4 text-primary" />
                    Analyze
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground" />
                  <span className="flex items-center gap-1.5">
                    <BarChart3 className="size-4 text-primary" />
                    Review report
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground" />
                  <span className="flex items-center gap-1.5">
                    <Send className="size-4 text-primary" />
                    Send report
                  </span>
                </div>
                <Button asChild className="mt-6">
                  <Link to="/auth">Explore Reporting</Link>
                </Button>
              </Reveal>
            </div>
          </section>
        )}

        {c.sections.security && (
          <section className="mx-auto max-w-6xl px-4 py-20">
            <SectionHead eyebrow="Trust & security" title="Built to be trusted." />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                [Lock, "Secure API handling", "Keys stay on the server, never in the browser."],
                [
                  ShieldCheck,
                  "Protected credentials",
                  "Passwords are never stored or shown in plain text.",
                ],
                [FileText, "Audit tracking", "Every admin action is recorded."],
                [Eye, "Transparent analysis", "Every finding shows its evidence."],
                [Flag, "Controlled reporting", "You decide what gets reported or sent."],
              ].map(([I, t, b], i) => {
                const Icon = I as typeof Lock;
                return (
                  <Reveal key={t as string} delay={i * 80} className="surface p-5">
                    <Icon className="size-5 text-primary" />
                    <h3 className="mt-3 font-semibold">{t as string}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{b as string}</p>
                  </Reveal>
                );
              })}
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              Independent tool. Not affiliated with or endorsed by Google.
            </p>
          </section>
        )}

        {c.sections.faq && faq.length > 0 && (
          <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20">
            <SectionHead eyebrow="FAQ" title="Questions, answered." />
            <Accordion type="single" collapsible className="surface mt-10 px-5">
              {faq.map((f, i) => (
                <AccordionItem
                  key={i}
                  value={`f${i}`}
                  className="border-card-border last:border-b-0"
                >
                  <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        )}

        <section className="mx-auto max-w-6xl px-4 pb-20">
          <Reveal className="relative overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Make Better Decisions About Your Google Reviews.
            </h2>
            <p className="mt-3 opacity-90">
              Understand the data. See the evidence. Take responsible action.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" variant="secondary">
                <Link to="/contact">Book a Call</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                <a href="#how">Learn More</a>
              </Button>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-card-border bg-card/60">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <div className="font-bold">The Rating Guard</div>
            <p className="mt-2 text-sm text-muted-foreground">{c.footerTagline}</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Product</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="#how">How It Works</a>
              </li>
              <li>
                <a href="#reporting">Reports</a>
              </li>
              <li>
                <a href="#faq">FAQ</a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Company</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="#responsible">About</a>
              </li>
              {c.contactEmail && (
                <li>
                  <a href={`mailto:${c.contactEmail}`}>Contact</a>
                </li>
              )}
              {c.socialLinks.map((l) => (
                <li key={l.label}>
                  <a href={l.href} target="_blank" rel="noreferrer">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Legal</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {c.footerLinks.map((l) => (
                <li key={l.label}>
                  <a href={l.href}>{l.label}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="border-t border-card-border py-5 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} The Rating Guard. Not affiliated with Google.
        </p>
      </footer>
    </div>
  );
}
