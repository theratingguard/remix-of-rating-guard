import { Link } from "@tanstack/react-router";

export type RelatedServiceLink = {
  title: string;
  locale: string;
  slug: string;
  location: string;
};

export function RelatedServiceLinks({ links }: { links: RelatedServiceLink[] }) {
  if (links.length === 0) return null;

  return (
    <nav aria-labelledby="related-services-heading" className="space-y-4 border-t border-border pt-8">
      <h2 id="related-services-heading" className="text-2xl font-semibold text-foreground">
        Related Services
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {links.map((service) => (
          <li key={`${service.locale}/${service.slug}`}>
            <Link
              to="/$locale/service/$slug"
              params={{ locale: service.locale, slug: service.slug }}
              className="block rounded-lg border border-border px-4 py-3 text-primary hover:bg-muted/50"
            >
              {service.title}
              {service.location ? ` in ${service.location}` : ""}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
