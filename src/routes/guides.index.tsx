import { createFileRoute } from "@tanstack/react-router";
import { SEOHead } from "@/lib/seo/seo-head";
import { PILLAR_GUIDES } from "@/lib/seo/pillar-guides";

export const Route = createFileRoute("/guides/")({
  head: () =>
    SEOHead(
      {
        title: "Practical Review Management Guides | Rating Guard",
        description:
          "Evidence-led guides to review policies, recordkeeping, responding to criticism, and responsible review management.",
      },
      [],
      {
        canonicalPath: "/guides",
        breadcrumbs: [
          { name: "Home", url: "https://ratingguard.online/" },
          { name: "Guides", url: "https://ratingguard.online/guides" },
        ],
      },
    ),
  component: GuidesIndexPage,
});

function GuidesIndexPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-14 sm:py-20">
      <header className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          Rating Guard Editorial Guides
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          Practical review management guides
        </h1>
        <p className="text-lg leading-8 text-muted-foreground">
          Evidence-led information for assessing review-policy concerns, keeping appropriate
          records, and responding professionally. Google independently makes platform decisions; no
          service can guarantee a review outcome.
        </p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2">
        {PILLAR_GUIDES.map((guide) => (
          <li key={guide.slug}>
            <a
              href={`/guides/${guide.slug}`}
              className="block h-full rounded-xl border border-border p-5 hover:bg-muted/50"
            >
              <h2 className="font-semibold text-primary">{guide.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{guide.description}</p>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
