import { createFileRoute, notFound } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { isSeoLocale, resolveSeoLocale } from "@/lib/seo/locales";
import { loadCountryHashtags } from "@/lib/seo/country-hashtags";
import { createDirectAnswer } from "@/lib/seo/direct-answer";
import { isSeoVideo, YouTubeVideo } from "@/components/youtube-video";
import {
  SEOHead,
  type ProgrammaticSeoPage,
} from "@/lib/seo/seo-head";
import { RelatedServiceLinks, type RelatedServiceLink } from "@/components/related-service-links";

type SeoPageContent = ProgrammaticSeoPage["content"];
type SeoPageRecord = ProgrammaticSeoPage & { content: SeoPageContent };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isLocalBusiness(value: unknown): value is NonNullable<SeoPageContent["localBusiness"]> {
  if (!isRecord(value) || !isRecord(value["address"])) return false;
  const address = value["address"];
  const url = value["url"];
  let validUrl = url === undefined;
  if (typeof url === "string") {
    try {
      validUrl = new URL(url).protocol === "https:";
    } catch {
      validUrl = false;
    }
  }
  return (
    typeof value["name"] === "string" &&
    value["name"].trim().length > 0 &&
    typeof address["addressLocality"] === "string" &&
    address["addressLocality"].trim().length > 0 &&
    typeof address["addressCountry"] === "string" &&
    address["addressCountry"].trim().length > 0 &&
    validUrl &&
    (value["telephone"] === undefined || typeof value["telephone"] === "string") &&
    ["streetAddress", "addressRegion", "postalCode"].every(
      (key) => address[key] === undefined || typeof address[key] === "string",
    )
  );
}

function isSeoPageContent(value: unknown): value is SeoPageContent {
  if (!isRecord(value)) return false;
  const content = value;
  const intro = content["intro"];
  const sections = content["sections"];
  const faqs = content["faqs"];
  return (
    typeof intro === "string" &&
    intro.trim().length >= 120 &&
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
    faqs.every(
      (faq) =>
        isRecord(faq) &&
        typeof faq["question"] === "string" &&
        typeof faq["answer"] === "string",
    ) &&
    (content["localBusiness"] === undefined || isLocalBusiness(content["localBusiness"])) &&
    (content["video"] === undefined || isSeoVideo(content["video"]))
  );
}

function dailyRandom(seedValue: string) {
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

export const Route = createFileRoute("/$locale/service/$slug")({
  loader: async ({
    params,
  }): Promise<{
    page: SeoPageRecord;
    translations: Array<{ locale: string; slug: string }>;
    relatedServices: RelatedServiceLink[];
  }> => {
    const locale = resolveSeoLocale(params.locale);
    if (!locale || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(params.slug))
      throw notFound();

    const { data, error } = await supabase
      .from("seo_keywords")
      .select(
        "keyword,locale,slug,title,description,location,service,industry,related_keywords,hashtags,translation_group,updated_at,page_content",
      )
      .eq("locale", locale)
      .eq("slug", params.slug)
      .eq("status", "published")
      .not("page_content", "is", null)
      .maybeSingle();
    if (error) throw new Error(`Could not load the published SEO page: ${error.message}`);
    if (!data || !isSeoPageContent(data.page_content)) throw notFound();

    const page: SeoPageRecord = {
      keyword: data.keyword,
      locale: data.locale,
      slug: data.slug,
      title: data.title,
      description: data.description,
      location: data.location,
      service: data.service,
      industry: data.industry,
      related_keywords: data.related_keywords,
      hashtags: await loadCountryHashtags(locale.split("-")[1] ?? ""),
      translation_group: data.translation_group,
      updated_at: data.updated_at,
      content: data.page_content,
    };
    let translations: Array<{ locale: string; slug: string }> = [
      { locale: page.locale, slug: page.slug },
    ];
    if (page.translation_group) {
      const result = await supabase
        .from("seo_keywords")
        .select("locale,slug")
        .eq("translation_group", page.translation_group)
        .eq("status", "published")
        .not("page_content", "is", null);
      if (result.error)
        throw new Error(`Could not load published SEO translations: ${result.error.message}`);
      translations = (result.data ?? [])
        .filter((row) => isSeoLocale(row.locale))
        .map((row) => ({ locale: row.locale, slug: row.slug }));
    }
    const relatedResult = await supabase
      .from("seo_keywords")
      .select("locale,slug,title,location,service")
      .eq("status", "published")
      .eq("service", page.service)
      .neq("slug", page.slug)
      .not("page_content", "is", null)
      .order("slug")
      .limit(100);
    if (relatedResult.error)
      throw new Error(`Could not load related service pages: ${relatedResult.error.message}`);
    const ordered = [...(relatedResult.data ?? [])];
    const random = dailyRandom(`${page.locale}/${page.slug}:${new Date().toISOString().slice(0, 10)}`);
    for (let index = ordered.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(random() * (index + 1));
      [ordered[index], ordered[swapIndex]] = [ordered[swapIndex]!, ordered[index]!];
    }
    const targetCount = Math.min(ordered.length, 5 + Math.floor(random() * 6));
    const relatedServices = ordered.slice(0, targetCount).map((row) => ({
      title: row.title,
      locale: row.locale,
      slug: row.slug,
      location: row.location,
    }));
    return { page, translations, relatedServices };
  },
  head: ({ loaderData }) =>
    loaderData
      ? SEOHead(loaderData.page, loaderData.translations, {
          video: loaderData.page.content.video,
        })
      : {},
  component: SeoServicePage,
});

function SeoServicePage() {
  const { page, relatedServices } = Route.useLoaderData();
  const directAnswer = createDirectAnswer(page.title, page.content.intro);
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <article className="space-y-10">
        <header className="space-y-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            {page.keyword}
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">{page.title}</h1>
          <p
            id="direct-answer"
            className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-base leading-7 text-foreground"
          >
            {directAnswer}
          </p>
          <p className="text-lg leading-8 text-muted-foreground">{page.content.intro}</p>
        </header>
        {page.content.video && <YouTubeVideo video={page.content.video} />}
        {page.content.sections.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h2 className="text-2xl font-semibold text-foreground">{section.heading}</h2>
            <p className="leading-7 text-muted-foreground">{section.body}</p>
          </section>
        ))}
        {page.content.faqs.length > 0 && (
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold text-foreground">Frequently asked questions</h2>
            <dl className="space-y-5">
              {page.content.faqs.map((faq) => (
                <div key={faq.question} className="space-y-2">
                  <dt className="font-semibold text-foreground">{faq.question}</dt>
                  <dd className="leading-7 text-muted-foreground">{faq.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        <RelatedServiceLinks links={relatedServices} />
        <aside className="rounded-xl border border-border bg-muted/40 p-5">
          <p className="text-sm text-muted-foreground">
            Rating Guard helps businesses assess potentially policy-relevant reviews with
            evidence. Google makes all final decisions; removal is never guaranteed.
          </p>
        </aside>
      </article>
    </main>
  );
}
