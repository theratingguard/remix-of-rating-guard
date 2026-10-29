import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead, type ProgrammaticSeoPage } from "@/lib/seo/seo-head";
import { loadCountryHashtags } from "@/lib/seo/country-hashtags";
import { LocationSocialSharing } from "@/components/location-social-sharing";

type LocationContent = ProgrammaticSeoPage["content"];
type LocationPageData = {
  id: string;
  country_slug: string;
  city_slug: string;
  country_name: string;
  city_name: string;
  locale: string;
  description: string;
  page_content: LocationContent;
  published_at: string | null;
  updated_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isLocationBusiness(value: unknown): value is NonNullable<LocationContent["localBusiness"]> {
  if (!isRecord(value) || typeof value["name"] !== "string" || !value["name"].trim()) return false;
  const address = value["address"];
  return (
    isRecord(address) &&
    typeof address["addressLocality"] === "string" &&
    !!address["addressLocality"].trim() &&
    typeof address["addressCountry"] === "string" &&
    !!address["addressCountry"].trim() &&
    (value["url"] === undefined || typeof value["url"] === "string") &&
    (value["telephone"] === undefined || typeof value["telephone"] === "string")
  );
}

function isLocationContent(value: unknown): value is LocationContent {
  if (!isRecord(value)) return false;
  const sections = value["sections"];
  const faqs = value["faqs"];
  return (
    typeof value["intro"] === "string" &&
    value["intro"].trim().length >= 120 &&
    Array.isArray(sections) &&
    sections.length >= 3 &&
    sections.every(
      (section) =>
        isRecord(section) &&
        typeof section["heading"] === "string" &&
        section["heading"].trim().length >= 3 &&
        typeof section["body"] === "string" &&
        section["body"].trim().length >= 120,
    ) &&
    Array.isArray(faqs) &&
    faqs.length > 0 &&
    faqs.every(
      (faq) =>
        isRecord(faq) &&
        typeof faq["question"] === "string" &&
        faq["question"].trim().length >= 5 &&
        typeof faq["answer"] === "string" &&
        faq["answer"].trim().length >= 40,
    ) &&
    (value["localBusiness"] === undefined || isLocationBusiness(value["localBusiness"]))
  );
}

function stableRandom(seedValue: string) {
  let seed = 2166136261;
  for (const character of seedValue) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
}

export const Route = createFileRoute("/remove-google-review/$country/$city")({
  loader: async ({ params }) => {
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(params.country) ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(params.city)
    )
      throw notFound();

    const { data, error } = await supabase
      .from("review_location_pages")
      .select(
        "id,country_slug,city_slug,country_name,city_name,locale,description,page_content,published_at,updated_at",
      )
      .eq("country_slug", params.country)
      .eq("city_slug", params.city)
      .eq("status", "published")
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .maybeSingle();
    if (error) throw new Error(`Could not load this published location page: ${error.message}`);
    if (!data || !isLocationContent(data.page_content)) throw notFound();

    const relatedResult = await supabase
      .from("review_location_pages")
      .select("country_slug,city_slug,country_name,city_name,locale,page_content")
      .eq("status", "published")
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .neq("id", data.id)
      .order("country_slug")
      .order("city_slug")
      .limit(100);
    if (relatedResult.error)
      throw new Error(`Could not load related published cities: ${relatedResult.error.message}`);

    const candidates = (relatedResult.data ?? []).filter((city) =>
      isLocationContent(city.page_content),
    );
    const random = stableRandom(`${data.country_slug}/${data.city_slug}:${new Date().toISOString().slice(0, 10)}`);
    for (let index = candidates.length - 1; index > 0; index--) {
      const swap = Math.floor(random() * (index + 1));
      [candidates[index], candidates[swap]] = [candidates[swap]!, candidates[index]!];
    }
    const relatedCount = Math.min(candidates.length, 5 + Math.floor(random() * 6));
    const relatedCities = candidates.slice(0, relatedCount);
    const hashtags = await loadCountryHashtags(data.locale.split("-")[1] ?? "");
    return { page: data as LocationPageData, relatedCities, hashtags };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { page, hashtags } = loaderData;
    const canonicalPath = `/remove-google-review/${encodeURIComponent(page.country_slug)}/${encodeURIComponent(page.city_slug)}`;
    const title = `Google Review Policy Assessment in ${page.city_name}, ${page.country_name} | Rating Guard`;
    const seoPage: Partial<ProgrammaticSeoPage> & Pick<ProgrammaticSeoPage, "title" | "description"> = {
      title,
      description: page.description,
      locale: page.locale,
      slug: page.city_slug,
      keyword: `Google review policy assessment ${page.city_name} ${page.country_name}`,
      location: `${page.city_name}, ${page.country_name}`,
      service: "Google review policy assessment",
      industry: "",
      content: page.page_content,
      related_keywords: [],
      hashtags,
      translation_group: null,
      updated_at: page.updated_at,
    };
    return SEOHead(seoPage, [], {
      canonicalPath,
      breadcrumbs: [
        { name: "Home", url: "https://ratingguard.online/" },
        { name: page.city_name, url: `https://ratingguard.online${canonicalPath}` },
      ],
    });
  },
  component: LocationReviewPage,
});

function LocationReviewPage() {
  const { page, relatedCities, hashtags } = Route.useLoaderData();
  const title = `Google review policy assessment in ${page.city_name}, ${page.country_name}`;
  const canonicalPath = `/remove-google-review/${encodeURIComponent(page.country_slug)}/${encodeURIComponent(page.city_slug)}`;
  return (
    <main className="mx-auto max-w-4xl space-y-10 px-6 py-16">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link to="/" className="text-primary hover:underline">Home</Link>
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
          <nav aria-labelledby="related-cities-heading" className="space-y-4 border-t border-border pt-8">
            <h2 id="related-cities-heading" className="text-2xl font-semibold text-foreground">
              Related locations
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {relatedCities.map((city) => {
                return (
                  <li key={`${city.country_slug}/${city.city_slug}`}>
                    <Link
                      to="/remove-google-review/$country/$city"
                      params={{ country: city.country_slug, city: city.city_slug }}
                      className="block rounded-lg border border-border px-4 py-3 text-primary hover:bg-muted/50"
                    >
                      {city.city_name}, {city.country_name}
                    </Link>
                  </li>
                );
              })}
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
