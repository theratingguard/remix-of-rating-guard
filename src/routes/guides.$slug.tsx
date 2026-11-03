import { createFileRoute, notFound } from "@tanstack/react-router";
import { SEOHead } from "@/lib/seo/seo-head";
import { getPillarGuide, PILLAR_GUIDES } from "@/lib/seo/pillar-guides";

export const Route = createFileRoute("/guides/$slug")({
  loader: ({ params }) => {
    const guide = getPillarGuide(params.slug);
    if (!guide) throw notFound();
    return guide;
  },
  head: ({ loaderData }) =>
    loaderData
      ? SEOHead(
          {
            title: `${loaderData.title} | Rating Guard`,
            description: loaderData.description,
            keyword: loaderData.keywords[0],
            related_keywords: loaderData.keywords.slice(1),
            content: {
              intro: loaderData.intro,
              sections: loaderData.sections,
              faqs: loaderData.faqs,
            },
          },
          [],
          {
            canonicalPath: `/guides/${encodeURIComponent(loaderData.slug)}`,
            breadcrumbs: [
              { name: "Home", url: "https://ratingguard.online/" },
              { name: "Guides", url: "https://ratingguard.online/guides" },
              {
                name: loaderData.title,
                url: `https://ratingguard.online/guides/${encodeURIComponent(loaderData.slug)}`,
              },
            ],
          },
        )
      : {},
  component: PillarGuidePage,
});

function PillarGuidePage() {
  const guide = Route.useLoaderData();
  const relatedGuides = PILLAR_GUIDES.filter((candidate) => candidate.slug !== guide.slug).slice(
    0,
    4,
  );

  return (
    <main className="mx-auto max-w-4xl space-y-10 px-6 py-14 text-foreground sm:py-20">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <a href="/" className="text-primary hover:underline">
          Home
        </a>
        <span aria-hidden="true"> / </span>
        <a href="/guides" className="text-primary hover:underline">
          Guides
        </a>
      </nav>
      <article className="space-y-9">
        <header className="space-y-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Rating Guard Editorial Guide
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{guide.title}</h1>
          <p className="text-lg leading-8 text-muted-foreground">{guide.intro}</p>
        </header>
        {guide.sections.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h2 className="text-2xl font-semibold">{section.heading}</h2>
            <p className="leading-8 text-muted-foreground">{section.body}</p>
          </section>
        ))}
        <section
          aria-labelledby="pillar-faq-heading"
          className="space-y-5 border-t border-border pt-8"
        >
          <h2 id="pillar-faq-heading" className="text-2xl font-semibold">
            Frequently asked questions
          </h2>
          {guide.faqs.map((faq) => (
            <div key={faq.question} className="space-y-2">
              <h3 className="font-semibold">{faq.question}</h3>
              <p className="leading-7 text-muted-foreground">{faq.answer}</p>
            </div>
          ))}
        </section>
      </article>
      <nav
        aria-labelledby="related-guides-heading"
        className="space-y-4 border-t border-border pt-8"
      >
        <h2 id="related-guides-heading" className="text-2xl font-semibold">
          Related guides
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {relatedGuides.map((related) => (
            <li key={related.slug}>
              <a
                href={`/guides/${related.slug}`}
                className="block rounded-lg border border-border p-4 text-primary hover:bg-muted/50"
              >
                {related.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <aside className="rounded-xl border border-border bg-muted/40 p-5 text-sm leading-6 text-muted-foreground">
        Educational information only. Google independently determines whether reported content
        violates its policies. This guide does not guarantee removals and is not legal advice.
      </aside>
    </main>
  );
}
