import { Link } from "@tanstack/react-router";
import {
  agencyPath,
  industryReviewPath,
  partnerPath,
  type CountryPageData,
  type IndustryCountryPageData,
} from "@/lib/seo/industry-seo";

type Props =
  | ({ kind: "review" } & IndustryCountryPageData)
  | ({ kind: "agency" } & IndustryCountryPageData)
  | ({ kind: "partners" } & CountryPageData);

function PageLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
    >
      {children}
    </a>
  );
}

export function IndustrySeoLandingPage(props: Props) {
  const review = props.kind === "review";
  const agency = props.kind === "agency";
  const country = props.country;
  const industry = props.kind === "partners" ? undefined : props.industry;
  const industryName = industry?.name ?? "";
  const title = review
    ? `Google review policy assessment for ${industryName} businesses in ${country.name}`
    : agency
      ? `Start a ${industryName} reputation services agency in ${country.name}`
      : `Become a Rating Guard partner in ${country.name}`;
  const content = review
    ? [
        {
          heading: "Document the review and its context",
          body: `Save the public review URL and relevant dates. Describe the facts about the ${industryName.toLowerCase()} business interaction using information you are authorized to share, and avoid disclosing unnecessary personal details.`,
        },
        {
          heading: "Assess policy fit rather than sentiment",
          body: "A low rating or unfavorable opinion is not, on its own, evidence of a policy violation. Identify a specific concern, distinguish facts from assumptions, and review the platform's current guidance before reporting.",
        },
        {
          heading: "Prepare a concise report",
          body: "If the evidence supports a policy concern, organize the URL, timeline, and a factual explanation. Avoid duplicate or coordinated reports that do not add relevant evidence.",
        },
        {
          heading: "Understand who decides",
          body: "Google reviews reports and makes the final decision. Keep a record of the response, use available appeal options where appropriate, and address legitimate feedback through normal business channels.",
        },
      ]
    : [
        {
          heading: "Design a responsible service",
          body: `Build an evidence-led offer for ${industry ? `${industryName.toLowerCase()} businesses in ` : ""}${country.name}. Explain the difference between policy assessment, reporting support, and outcomes that only Google can decide.`,
        },
        {
          heading: "Use careful intake and data practices",
          body: "Collect only information needed to review a concern, confirm that clients may share it, and handle business and customer data securely.",
        },
        {
          heading: "Confirm the current program terms",
          body: "Partner applications require approval. Verify availability, payment requirements, commission rules, branding permissions, and support arrangements directly before launching.",
        },
        {
          heading: "Set honest expectations",
          body: "Do not promise review removal, rating increases, leads, or income. Program earnings depend on eligible activity and current terms; no outcome is guaranteed.",
        },
      ];

  return (
    <main className="mx-auto max-w-5xl space-y-12 px-6 py-14 text-foreground sm:py-20">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link to="/" className="text-primary hover:underline">
          Home
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{country.name}</span>
        {industry && (
          <>
            <span aria-hidden="true"> / </span>
            <span>{industry.name}</span>
          </>
        )}
      </nav>
      <header className="space-y-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          {review
            ? "Review policy assessment"
            : agency
              ? "Agency partner guide"
              : "Reseller partner program"}
        </p>
        <h1 className="max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
        <p className="max-w-3xl text-lg leading-8 text-muted-foreground">
          {review
            ? `A practical, evidence-led overview for ${industry!.name.toLowerCase()} businesses in ${country.name}. Report only concerns supported by accurate facts; Google independently decides whether a review violates its policies.`
            : `Explore responsible ways to offer review assessment services in ${country.name}. Confirm eligibility and current program terms before making commitments.`}
        </p>
        <PageLink href={review ? "/get-started" : "/reseller/register"}>
          {review ? "Get started with review assessment" : "Explore the partner application"}
        </PageLink>
      </header>

      <article className="space-y-9">
        {content.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h2 className="text-2xl font-semibold">{section.heading}</h2>
            <p className="leading-7 text-muted-foreground">{section.body}</p>
          </section>
        ))}
      </article>

      <section aria-labelledby="faq-heading" className="space-y-5 border-t border-border pt-8">
        <h2 id="faq-heading" className="text-2xl font-semibold">
          Frequently asked questions
        </h2>
        {(review
          ? [
              [
                "Can Rating Guard guarantee that a review will be removed?",
                "No. Google independently reviews reports and makes every decision under its own policies.",
              ],
              [
                "Is a negative opinion alone a policy violation?",
                "No. A negative rating or disagreement is not by itself evidence that content violates policy.",
              ],
            ]
          : [
              [
                "Does program approval guarantee earnings?",
                "No. Earnings are not guaranteed and depend on eligible transactions and current program terms.",
              ],
              [
                "Can an agency promise review removal?",
                "No. Google makes all review decisions; partners must not promise removals or specific outcomes.",
              ],
            ]
        ).map(([question, answer]) => (
          <div key={question} className="space-y-2">
            <h3 className="font-semibold">{question}</h3>
            <p className="leading-7 text-muted-foreground">{answer}</p>
          </div>
        ))}
      </section>

      {industry && (
        <nav
          aria-label="Related industry resources"
          className="flex flex-wrap gap-3 border-t border-border pt-8"
        >
          <a
            className="text-primary underline-offset-4 hover:underline"
            href={agencyPath(industry.slug, country.slug)}
          >
            Agency guide for {industry.name} in {country.name}
          </a>
          <a
            className="text-primary underline-offset-4 hover:underline"
            href={industryReviewPath(industry.slug, country.slug)}
          >
            Review policy guide for {industry.name} in {country.name}
          </a>
          <a
            className="text-primary underline-offset-4 hover:underline"
            href={partnerPath(country.slug)}
          >
            Partner program in {country.name}
          </a>
        </nav>
      )}

      <aside className="rounded-xl border border-border bg-muted/40 p-5 text-sm leading-6 text-muted-foreground">
        Rating Guard supports policy assessment and evidence organization. Google independently
        reviews reports. No removal, rating change, partner approval, or earnings are guaranteed.
      </aside>
    </main>
  );
}
