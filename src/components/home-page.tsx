import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, BadgeCheck, BarChart3, Eye, FileText, Flag, Lock, MessageSquareText, ScanSearch, Search, Send, ShieldCheck, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { SiteContent } from "@/lib/site-content";
import shield from "@/assets/icon-shield.png";
import scanIcon from "@/assets/icon-scan.png";
import reportIcon from "@/assets/icon-report.png";
import alertIcon from "@/assets/icon-alert.png";

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} style={{ transitionDelay: `${delay}ms` }} className={`transition-all duration-700 motion-reduce:transition-none ${on ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"} ${className}`}>{children}</div>;
}

const STAGES = ["Review received", "Scanning context", "Risk signal found", "Evidence highlighted", "Policy-aligned action"];

function HeroVisual() {
  const [s, setS] = useState(0);
  useEffect(() => { const t = setInterval(() => setS((x) => (x + 1) % STAGES.length), 1600); return () => clearInterval(t); }, []);
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden>
      <div className="absolute -inset-6 rounded-[2rem] bg-primary/15 blur-3xl" />
      <img src={scanIcon} alt="" width={120} height={120} className="icon-3d animate-float absolute -left-14 -top-12 z-10 w-28" />
      <img src={alertIcon} alt="" width={96} height={96} className="icon-3d animate-float absolute -bottom-10 -right-10 z-10 w-24 [animation-delay:1.5s]" />
      <img src={reportIcon} alt="" width={90} height={90} className="icon-3d animate-float absolute -right-12 -top-8 z-10 w-20 [animation-delay:3s]" />
      <div className="surface neon-outline relative overflow-hidden p-5">
        {s === 1 && <div className="pointer-events-none absolute inset-x-0 h-16 animate-[scan_1.6s_ease-in-out] bg-gradient-to-b from-transparent via-primary/15 to-transparent" />}
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-full bg-secondary font-semibold text-secondary-foreground">J</div>
          <div><div className="text-sm font-semibold">Example reviewer</div><div className="flex text-star">{[0,1,2,3,4].map((i) => <Star key={i} className={`size-3.5 ${i < 1 ? "fill-current" : "opacity-30"}`} />)}</div></div>
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Example</span>
        </div>
        <p className="mt-4 text-sm leading-relaxed">Terrible place. <span className={`rounded px-0.5 transition-colors duration-500 ${s >= 3 ? "bg-risk-high/20 text-risk-high" : ""}`}>Go to BestCleaners.com instead, use code SAVE20</span> for a discount!</p>
        <div className="mt-5 space-y-2">
          {STAGES.map((st, i) => (
            <div key={st} className={`flex items-center gap-2 text-xs transition-all duration-500 ${i <= s ? "opacity-100" : "opacity-30"}`}>
              <span className={`size-2 rounded-full ${i < s ? "bg-risk-normal" : i === s ? "animate-pulse bg-primary" : "bg-muted-foreground/40"}`} />
              {st}
              {i === 2 && i <= s && <span className="ml-auto rounded-full bg-risk-high/15 px-2 py-0.5 font-semibold text-risk-high">High · Promotional</span>}
              {i === 4 && i <= s && <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-primary">Official Google path</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-muted-foreground md:text-lg">{body}</p>}
    </Reveal>
  );
}

export function HomePage({ c, preview }: { c: SiteContent; preview?: boolean }) {
  const faq = c.faq.filter((f) => f.visible);
  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      {preview && <div className="bg-risk-medium/20 py-2 text-center text-sm font-medium">Draft preview — not yet published</div>}
      {c.announcement && <div className="bg-primary py-2 text-center text-sm text-primary-foreground">{c.announcement}</div>}

      <header className="glass sticky top-0 z-30 border-x-0 border-t-0">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <a href="#top" className="flex items-center gap-2 font-bold"><img src={shield} alt="" width={36} height={36} className="icon-3d size-9" /><span className="hidden font-display sm:inline">The Rating <span className="text-gradient">Guard</span></span></a>
          <div className="ml-auto hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#reporting" className="hover:text-foreground">Reports</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </div>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Button asChild size="sm"><Link to="/auth">{c.ctaPrimary}</Link></Button>
          </div>
        </nav>
      </header>

      <main id="top">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-2 md:py-24">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-card-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"><ShieldCheck className="size-3.5 text-risk-normal" /> Policy-aligned review intelligence</p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight md:text-5xl lg:text-6xl">{c.heroTitle.split(". ")[0]}.{" "}<span className="text-gradient">{c.heroTitle.split(". ").slice(1).join(". ")}</span></h1>
            <p className="mt-5 text-lg text-muted-foreground">{c.heroSubtitle}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link to="/auth">{c.ctaPrimary} <ArrowRight /></Link></Button>
              <Button asChild size="lg" variant="outline"><a href="#how">{c.ctaSecondary}</a></Button>
            </div>
          </Reveal>
          <Reveal delay={150}><HeroVisual /></Reveal>
        </section>

        <section className="border-y border-card-border bg-card/60">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-6 text-sm font-medium sm:grid-cols-5">
            {[[BadgeCheck, "Evidence-Based"], [ShieldCheck, "Policy-Aligned"], [Sparkles, "AI-Assisted"], [Lock, "Secure"], [Eye, "Transparent"]].map(([I, t], i) => {
              const Icon = I as typeof BadgeCheck;
              return <Reveal key={t as string} delay={i * 80} className="flex items-center justify-center gap-2"><Icon className="size-4 text-primary" />{t as string}</Reveal>;
            })}
          </div>
        </section>

        {c.sections.problem && (
          <section className="mx-auto max-w-6xl px-4 py-20">
            <SectionHead eyebrow="The problem" title="Not Every Bad Review Is a Policy Violation." body="A negative review can be completely legitimate. We keep negative feedback and potential policy risk apart, so you only act where it's justified." />
            <div className="mt-12 grid items-center gap-6 md:grid-cols-[1fr_auto_1fr]">
              <Reveal className="surface p-6 text-center"><div className="text-5xl font-extrabold">4.7<span className="text-star">★</span></div><p className="mt-2 font-semibold">Business rating</p><p className="text-sm text-muted-foreground">How customers feel overall</p></Reveal>
              <div className="text-center text-2xl font-bold text-muted-foreground">+</div>
              <Reveal delay={120} className="surface p-6 text-center"><div className="text-5xl font-extrabold text-risk-high">1</div><p className="mt-2 font-semibold">Potentially risky review</p><p className="text-sm text-muted-foreground">A separate question: does it break a policy?</p></Reveal>
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">Illustrative example</p>
          </section>
        )}

        {c.sections.responsible && (
          <section id="responsible" className="bg-sidebar py-20 text-sidebar-foreground">
            <div className="mx-auto max-w-6xl px-4">
              <Reveal className="mx-auto max-w-2xl text-center">
                <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Don't Risk Your Google Presence for a Quick Fix.</h2>
                <p className="mt-4 opacity-80">Some services use artificial engagement, fake reporting, review manipulation or spam networks. Those approaches can create unnecessary long-term risk. Our approach is designed to reduce unnecessary policy risk.</p>
                <p className="mt-4 text-sm opacity-70">{c.trustStatement}</p>
              </Reveal>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                {["Real Data", "Evidence", "Policy Awareness", "Transparent Analysis", "Responsible Actions"].map((t, i) => (
                  <Reveal key={t} delay={i * 80}><span className="inline-flex items-center gap-2 rounded-full border border-sidebar-border px-4 py-2 text-sm"><BadgeCheck className="size-4 text-risk-normal" />{t}</span></Reveal>
                ))}
              </div>
            </div>
          </section>
        )}

        {c.sections.how && (
          <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
            <SectionHead eyebrow="How it works" title="Five clear steps, from link to action." />
            <ol className="mt-12 grid gap-4 md:grid-cols-5">
              {c.steps.map((st, i) => (
                <Reveal key={i} delay={i * 120}>
                  <li className="surface h-full list-none p-5">
                    <span className="font-mono text-sm font-semibold text-primary">{String(i + 1).padStart(2, "0")}</span>
                    <h3 className="mt-2 font-semibold">{st.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{st.body}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </section>
        )}

        {c.sections.ai && (
          <section className="bg-secondary/40 py-20">
            <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 md:grid-cols-2">
              <Reveal>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">AI intelligence</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">AI That Explains — Not Just Scores.</h2>
                <ul className="mt-6 space-y-3 text-muted-foreground">
                  {["Understands review context", "Identifies potential risk signals", "Explains the evidence", "Suggests professional replies", "Organizes findings"].map((t) => <li key={t} className="flex gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-risk-normal" />{t}</li>)}
                </ul>
                <p className="mt-6 text-sm text-muted-foreground">AI findings are analytical assessments. Google makes the final decision.</p>
              </Reveal>
              <Reveal delay={150} className="surface space-y-3 p-6 text-sm">
                <div className="flex items-center justify-between"><span className="font-semibold">Review analysis</span><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Example</span></div>
                {[["Risk", <span key="r" className="font-semibold text-risk-high">High</span>], ["Reason", "Promotes another business instead of describing an experience."], ["Evidence", <span key="e" className="font-mono text-xs">"Go to BestCleaners.com instead"</span>], ["Confidence", "92%"], ["Suggested action", "Review evidence, then use Google's official reporting path."]].map(([k, v]) => (
                  <div key={k as string} className="grid grid-cols-[110px_1fr] gap-2 border-t border-card-border pt-3"><span className="text-muted-foreground">{k}</span><span>{v}</span></div>
                ))}
              </Reveal>
            </div>
          </section>
        )}

        {c.sections.reply && (
          <section className="mx-auto max-w-6xl px-4 py-20">
            <SectionHead eyebrow="Reply assistant" title="Respond Better to the Reviews That Matter." body="Pick a tone and get a professional, editable reply. Nothing is posted automatically — you stay in control." />
            <div className="mt-12 grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
              {[[Star, "Review", "“Food was cold and nobody checked on us.”"], [Sparkles, "AI understanding", "Legitimate service complaint. No policy concern."], [MessageSquareText, "Suggested reply", "“We're sorry your visit fell short. We'd love to make it right — please reach out to us directly.”"]].map(([I, t, b], i, arr) => {
                const Icon = I as typeof Star;
                return [
                  <Reveal key={t as string} delay={i * 120} className="surface p-5"><Icon className="size-5 text-primary" /><h3 className="mt-3 font-semibold">{t as string}</h3><p className="mt-2 text-sm text-muted-foreground">{b as string}</p></Reveal>,
                  i < arr.length - 1 && <div key={`a${i}`} className="hidden items-center md:flex"><ArrowRight className="text-muted-foreground" /></div>,
                ];
              })}
            </div>
            <div className="mt-8 text-center"><Button asChild variant="outline"><a href="#how">See How It Works</a></Button></div>
          </section>
        )}

        {c.sections.reporting && (
          <section id="reporting" className="scroll-mt-20 bg-secondary/40 py-20">
            <div className="mx-auto max-w-6xl px-4">
              <SectionHead eyebrow="Reporting" title="Turn Review Data Into a Clear Report." body="Know what was scanned, what was found, why it matters, and what action may be appropriate." />
              <Reveal className="surface mx-auto mt-12 max-w-3xl p-6">
                <div className="flex items-center justify-between"><div className="flex items-center gap-2 font-semibold"><FileText className="size-4 text-primary" /> Review scan report</div><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Example layout</span></div>
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[["Business rating", "4.7★", ""], ["Reviews analyzed", "5", ""], ["Potentially risky", "2", "text-risk-medium"], ["High risk", "1", "text-risk-high"], ["Manual review", "1", ""], ["Data quality", "High", "text-risk-normal"]].map(([k, v, cl]) => (
                    <div key={k} className="rounded-lg border border-card-border p-4"><div className="text-xs text-muted-foreground">{k}</div><div className={`mt-1 text-2xl font-bold ${cl}`}>{v}</div></div>
                  ))}
                </div>
              </Reveal>
              <Reveal className="mx-auto mt-12 max-w-3xl text-center">
                <h3 className="text-2xl font-bold">Ready-to-Share Reports.</h3>
                <p className="mt-3 text-muted-foreground">Generate a professional report and send it to your client when <b>you</b> choose. Reports are never sent automatically.</p>
                <div className="mt-6 flex items-center justify-center gap-3 text-sm font-medium">
                  <span className="flex items-center gap-1.5"><Search className="size-4 text-primary" />Analyze</span><ArrowRight className="size-4 text-muted-foreground" />
                  <span className="flex items-center gap-1.5"><BarChart3 className="size-4 text-primary" />Review report</span><ArrowRight className="size-4 text-muted-foreground" />
                  <span className="flex items-center gap-1.5"><Send className="size-4 text-primary" />Send report</span>
                </div>
                <Button asChild className="mt-6"><Link to="/auth">Explore Reporting</Link></Button>
              </Reveal>
            </div>
          </section>
        )}

        {c.sections.security && (
          <section className="mx-auto max-w-6xl px-4 py-20">
            <SectionHead eyebrow="Trust & security" title="Built to be trusted." />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[[Lock, "Secure API handling", "Keys stay on the server, never in the browser."], [ShieldCheck, "Protected credentials", "Passwords are never stored or shown in plain text."], [FileText, "Audit tracking", "Every admin action is recorded."], [Eye, "Transparent analysis", "Every finding shows its evidence."], [Flag, "Controlled reporting", "You decide what gets reported or sent."]].map(([I, t, b], i) => {
                const Icon = I as typeof Lock;
                return <Reveal key={t as string} delay={i * 80} className="surface p-5"><Icon className="size-5 text-primary" /><h3 className="mt-3 font-semibold">{t as string}</h3><p className="mt-1 text-sm text-muted-foreground">{b as string}</p></Reveal>;
              })}
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground">Independent tool. Not affiliated with or endorsed by Google.</p>
          </section>
        )}

        {c.sections.faq && faq.length > 0 && (
          <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20">
            <SectionHead eyebrow="FAQ" title="Questions, answered." />
            <Accordion type="single" collapsible className="surface mt-10 px-5">
              {faq.map((f, i) => (
                <AccordionItem key={i} value={`f${i}`} className="border-card-border last:border-b-0">
                  <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        )}

        <section className="mx-auto max-w-6xl px-4 pb-20">
          <Reveal className="relative overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Make Better Decisions About Your Google Reviews.</h2>
            <p className="mt-3 opacity-90">Understand the data. See the evidence. Take responsible action.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" variant="secondary"><Link to="/auth">{c.ctaPrimary}</Link></Button>
              <Button asChild size="lg" variant="ghost" className="hover:bg-primary-foreground/10 hover:text-primary-foreground"><a href="#how">Learn More</a></Button>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-card-border bg-card/60">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 md:grid-cols-4">
          <div><div className="font-bold">Review Intelligence</div><p className="mt-2 text-sm text-muted-foreground">{c.footerTagline}</p></div>
          <div><h3 className="text-sm font-semibold">Product</h3><ul className="mt-3 space-y-2 text-sm text-muted-foreground"><li><a href="#how">How It Works</a></li><li><a href="#reporting">Reports</a></li><li><a href="#faq">FAQ</a></li></ul></div>
          <div><h3 className="text-sm font-semibold">Company</h3><ul className="mt-3 space-y-2 text-sm text-muted-foreground"><li><a href="#responsible">About</a></li>{c.contactEmail && <li><a href={`mailto:${c.contactEmail}`}>Contact</a></li>}{c.socialLinks.map((l) => <li key={l.label}><a href={l.href} target="_blank" rel="noreferrer">{l.label}</a></li>)}</ul></div>
          <div><h3 className="text-sm font-semibold">Legal</h3><ul className="mt-3 space-y-2 text-sm text-muted-foreground">{c.footerLinks.map((l) => <li key={l.label}><a href={l.href}>{l.label}</a></li>)}</ul></div>
        </div>
        <p className="border-t border-card-border py-5 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} Review Intelligence. Not affiliated with Google.</p>
      </footer>
    </div>
  );
}
