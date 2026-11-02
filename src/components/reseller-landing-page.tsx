import { Link } from "@tanstack/react-router";
import { ArrowRight, Bot, BriefcaseBusiness, ChartNoAxesCombined, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEOHead, type SeoFaq } from "@/lib/seo/seo-head";

const RESELLER_FAQS: SeoFaq[] = [
  {
    question: "Can Rating Guard guarantee that Google will remove a review?",
    answer:
      "No. Google independently reviews reports and makes every decision under its own policies. A reseller or Rating Guard cannot guarantee removal or a particular outcome.",
  },
  {
    question: "How do reseller commissions work?",
    answer:
      "Commission rates are set by the selected active plan and apply only to eligible, paid review-removal orders. Earnings are not guaranteed and depend on qualifying transactions.",
  },
  {
    question: "When does a reseller account become active?",
    answer:
      "Applications require Rating Guard approval and confirmed membership payment. Submitting an application alone does not activate a reseller account.",
  },
  {
    question: "Does the program include a white-label dashboard?",
    answer:
      "The reseller workspace includes tools for managing assigned businesses and team members. Confirm current branding and white-label options with Rating Guard before applying.",
  },
  {
    question: "Can I start a reputation agency with this program?",
    answer:
      "The program is intended for approved partners who want to offer review assessment workflows to their clients. You remain responsible for your agency's claims and client communications.",
  },
];

const BENEFITS = [
  {
    title: "Plan-based commissions",
    description:
      "Review active plan terms and commission rates before applying. Commissions apply only to eligible, paid orders; no income is guaranteed.",
    Icon: ChartNoAxesCombined,
  },
  {
    title: "Reseller workspace",
    description:
      "Manage assigned businesses, team members, referrals, and commission activity from your reseller account.",
    Icon: BriefcaseBusiness,
  },
  {
    title: "AI-assisted workflows",
    description:
      "Use review analysis and draft-generation tools to support evidence-led work. People review outputs, and Google makes all policy decisions.",
    Icon: Bot,
  },
];

const KEYWORDS = [
  "review removal reseller",
  "start reputation agency",
  "white label review removal",
  "review management reseller program",
  "Google review policy assessment",
  "reputation management business",
  "make money removing Google reviews",
];

export function resellerLandingHead(country?: string) {
  const title = country
    ? `Reseller Program for ${country} | Rating Guard`
    : "Start Your Own Review Removal Business | Reseller Commissions | RatingGuard";
  const description =
    "Explore the Rating Guard reseller program: plan-based commissions, a workspace for assigned businesses and teams, and AI-assisted review workflows. Approval and terms apply.";
  const head = SEOHead(
    {
      title,
      description,
      keyword: "review removal reseller",
      related_keywords: KEYWORDS.slice(1),
      content: { intro: "", sections: [], faqs: RESELLER_FAQS },
    },
    [],
    { canonicalPath: country ? "/become-a-reseller" : "/become-a-reseller" },
  );
  const robotsMeta = country
    ? [
        ...(head.meta ?? []).filter((meta) => !("name" in meta && meta.name === "robots")),
        { name: "robots", content: "noindex,follow" },
      ]
    : head.meta;

  return {
    ...head,
    meta: robotsMeta,
    scripts: [
      ...(head.scripts ?? []),
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          name: "Rating Guard Reseller Program",
          serviceType: "Review assessment and reseller partnership",
          provider: {
            "@type": "Organization",
            name: "Rating Guard",
            url: "https://ratingguard.online",
          },
          url: "https://ratingguard.online/become-a-reseller",
          description,
          audience: { "@type": "BusinessAudience", audienceType: "Businesses and agencies" },
        }),
      },
    ],
  };
}

export function ResellerLandingPage({ country }: { country?: string }) {
  return (
    <main className="min-h-svh bg-background pb-32 text-foreground">
      <section className="relative overflow-hidden border-b border-card-border bg-[#080F1D]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.2),transparent_55%)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            <Users className="size-4" aria-hidden="true" />
            Rating Guard Reseller Program
          </p>
          <h1 className="mt-7 max-w-4xl text-4xl font-bold tracking-tight text-white sm:text-6xl">
            Start Your Own Review Removal Agency Today
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            Build a reputation services offering around evidence-led review assessment. Use Rating
            Guard tools to support client workflows—while being clear that Google alone decides
            whether a review violates policy.
          </p>
          {country && (
            <p className="mt-4 text-sm text-slate-300">
              Exploring the program from {country}? Contact us to confirm current availability and
              terms for your region.
            </p>
          )}
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Button asChild size="lg" className="shadow-[0_0_28px_rgba(16,185,129,0.3)]">
              <Link to="/reseller/register">
                Apply as Reseller Now <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <a href="#how-it-works" className="text-sm font-medium text-slate-200 hover:underline">
              See how the program works
            </a>
          </div>
          <p className="mt-5 max-w-2xl text-xs leading-5 text-slate-400">
            Applications require approval and confirmed membership payment. Commissions depend on
            your selected plan and qualifying paid orders; earnings and review removals are not
            guaranteed.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16" aria-labelledby="benefits-heading">
        <div className="max-w-2xl">
          <h2 id="benefits-heading" className="text-3xl font-bold tracking-tight">
            Tools to support your reputation services business
          </h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            A practical partner workflow, with transparent plan terms and review decisions left to
            the platform that owns them.
          </p>
        </div>
        <div className="mt-9 grid gap-5 md:grid-cols-3">
          {BENEFITS.map(({ title, description, Icon }) => (
            <article key={title} className="rounded-2xl border border-card-border bg-card p-6">
              <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="how-it-works"
        className="mx-auto grid max-w-6xl gap-10 px-6 py-12 md:grid-cols-[0.8fr_1.2fr]"
      >
        <div>
          <h2 className="text-3xl font-bold tracking-tight">A clear path to apply</h2>
          <p className="mt-4 leading-7 text-muted-foreground">
            Review the live plans and commission rates in the application before choosing a plan.
          </p>
        </div>
        <ol className="space-y-5">
          {[
            [
              "Choose a plan",
              "Compare current annual fees and commission terms in the application.",
            ],
            [
              "Submit your application",
              "Create a reseller account and confirm your email address.",
            ],
            [
              "Wait for approval",
              "Membership remains pending until approval and confirmed payment are recorded.",
            ],
            [
              "Manage eligible client work",
              "Use the workspace for assigned businesses and track qualifying activity.",
            ],
          ].map(([title, description], index) => (
            <li key={title} className="flex gap-4 rounded-xl border border-card-border bg-card p-5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {index + 1}
              </span>
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-4xl space-y-6 px-6 py-16">
        <h2 className="text-3xl font-bold tracking-tight">Reseller program FAQs</h2>
        {RESELLER_FAQS.map((faq) => (
          <article key={faq.question} className="rounded-xl border border-card-border bg-card p-5">
            <h3 className="font-semibold">{faq.question}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{faq.answer}</p>
          </article>
        ))}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-card-border bg-background/95 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.18)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-2">
          <p className="hidden text-sm text-muted-foreground sm:block">
            Explore current plan fees and eligibility.
          </p>
          <Button asChild className="ml-auto shadow-[0_0_24px_rgba(16,185,129,0.25)]">
            <Link to="/reseller/register">
              Apply as Reseller Now <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
