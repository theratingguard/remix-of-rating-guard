import { Link } from "@tanstack/react-router";
import { LocationSocialSharing } from "@/components/location-social-sharing";
import { locationPath, type LocationPageData } from "@/lib/seo/location-review-page";

export function LocationReviewPage({ data }: { data: LocationPageData }) {
  const { page, relatedCities, hashtags } = data;
  const title = `Google review policy assessment in ${page.city_name}, ${page.country_name}`;
  const canonicalPath = locationPath(page.country_slug, page.city_slug, page.locale);

  return (
    <main className="mx-auto max-w-4xl space-y-10 px-6 py-16">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link to="/" className="text-primary hover:underline">
          Home
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{page.country_name}</span>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{page.city_name}</span>
      </nav>
      <article className="space-y-10">
        <header className="space-y-5">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="text-lg leading-8 text-muted-foreground">{page.page_content.intro}</p>
        </header>
        {page.page_content.sections.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h2 className="text-2xl font-semibold text-foreground">{section.heading}</h2>
            <p className="leading-7 text-muted-foreground">{section.body}</p>
          </section>
        ))}
        {page.page_content.faqs.length > 0 && (
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold text-foreground">Frequently asked questions</h2>
            {page.page_content.faqs.map((faq) => (
              <div key={faq.question} className="space-y-2">
                <h3 className="font-semibold text-foreground">{faq.question}</h3>
                <p className="leading-7 text-muted-foreground">{faq.answer}</p>
              </div>
            ))}
          </section>
        )}
        {relatedCities.length > 0 && (
          <nav
            aria-labelledby="related-cities-heading"
            className="space-y-4 border-t border-border pt-8"
          >
            <h2 id="related-cities-heading" className="text-2xl font-semibold text-foreground">
              More locations in {page.country_name}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {relatedCities.map((city) => (
                <li key={`${city.country_slug}/${city.city_slug}`}>
                  <a
                    href={locationPath(city.country_slug, city.city_slug, page.locale)}
                    className="block rounded-lg border border-border px-4 py-3 text-primary hover:bg-muted/50"
                  >
                    {city.city_name}, {city.country_name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <aside className="rounded-xl border border-border bg-muted/40 p-5 text-sm leading-6 text-muted-foreground">
          Rating Guard helps assess potentially policy-relevant reviews and organize evidence.
          Google makes all final decisions; no removal or outcome is guaranteed.
        </aside>
        <LocationSocialSharing
          title={title}
          url={`https://ratingguard.online${canonicalPath}`}
          hashtags={hashtags}
        />
      </article>
    </main>
  );
}
