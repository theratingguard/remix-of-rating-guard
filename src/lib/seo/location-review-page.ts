import { supabase } from "@/integrations/supabase/client";
import { loadCountryHashtags } from "@/lib/seo/country-hashtags";
import { isSeoLocale, type SeoLocale } from "@/lib/seo/locales";
import { SEOHead, type ProgrammaticSeoPage } from "@/lib/seo/seo-head";

type LocationContent = ProgrammaticSeoPage["content"];

export type LocationPageRecord = {
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

export type LocationTranslation = {
  locale: string;
  path: string;
};

export type LocationPageData = {
  page: LocationPageRecord;
  relatedCities: Array<
    Pick<LocationPageRecord, "country_slug" | "city_slug" | "country_name" | "city_name">
  >;
  hashtags: string[];
  translations: LocationTranslation[];
};

export class LocationPageNotFoundError extends Error {
  constructor() {
    super("Location page not found.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isLocationBusiness(
  value: unknown,
): value is NonNullable<LocationContent["localBusiness"]> {
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

export function isLocationContent(value: unknown): value is LocationContent {
  if (!isRecord(value)) return false;
  const sections = value["sections"];
  const faqs = value["faqs"];
  const contentParts = [
    value["intro"],
    ...(Array.isArray(sections)
      ? sections.flatMap((section) => (isRecord(section) ? [section["body"]] : []))
      : []),
    ...(Array.isArray(faqs) ? faqs.flatMap((faq) => (isRecord(faq) ? [faq["answer"]] : [])) : []),
  ];
  const wordCount = contentParts
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

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
    wordCount >= 300 &&
    (value["localBusiness"] === undefined || isLocationBusiness(value["localBusiness"]))
  );
}

export function locationPath(country: string, city: string, locale: string) {
  const path = `/remove-google-review/${encodeURIComponent(country)}/${encodeURIComponent(city)}`;
  return locale === "en-US" ? path : `/${encodeURIComponent(locale)}${path}`;
}

export async function loadLocationPage(
  country: string,
  city: string,
  locale: string,
): Promise<LocationPageData> {
  const { data, error } = await supabase
    .from("review_location_pages")
    .select(
      "id,country_slug,city_slug,country_name,city_name,locale,description,page_content,published_at,updated_at",
    )
    .eq("country_slug", country)
    .eq("city_slug", city)
    .eq("locale", locale)
    .eq("status", "published")
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error(`Could not load this published location page: ${error.message}`);
  if (!data || !isLocationContent(data.page_content)) throw new LocationPageNotFoundError();

  const [relatedResult, translationResult, hashtags] = await Promise.all([
    supabase
      .from("review_location_pages")
      .select("country_slug,city_slug,country_name,city_name,locale,page_content")
      .eq("country_slug", data.country_slug)
      .eq("locale", locale)
      .eq("status", "published")
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .neq("id", data.id)
      .order("city_slug")
      .limit(50),
    supabase
      .from("review_location_pages")
      .select("locale,page_content")
      .eq("country_slug", data.country_slug)
      .eq("city_slug", data.city_slug)
      .eq("status", "published")
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString()),
    loadCountryHashtags(locale.split("-")[1] ?? ""),
  ]);
  if (relatedResult.error)
    throw new Error(`Could not load related published cities: ${relatedResult.error.message}`);
  if (translationResult.error)
    throw new Error(
      `Could not load published location translations: ${translationResult.error.message}`,
    );

  const relatedCities = (relatedResult.data ?? [])
    .filter((candidate) => isLocationContent(candidate.page_content))
    .slice(0, 3)
    .map(({ country_slug, city_slug, country_name, city_name }) => ({
      country_slug,
      city_slug,
      country_name,
      city_name,
    }));
  const translations = (translationResult.data ?? [])
    .filter(
      (translation) =>
        isSeoLocale(translation.locale) && isLocationContent(translation.page_content),
    )
    .map((translation) => ({
      locale: translation.locale,
      path: locationPath(data.country_slug, data.city_slug, translation.locale),
    }));

  return {
    page: data as LocationPageRecord,
    relatedCities,
    hashtags,
    translations,
  };
}

export function locationPageHead(data: LocationPageData) {
  const { page } = data;
  const canonicalPath = locationPath(page.country_slug, page.city_slug, page.locale);
  const title = `Google Review Policy Assessment in ${page.city_name}, ${page.country_name} | Rating Guard`;
  const seoPage: Partial<ProgrammaticSeoPage> & Pick<ProgrammaticSeoPage, "title" | "description"> =
    {
      title,
      description: page.description,
      locale: page.locale,
      keyword: `Google review policy assessment ${page.city_name} ${page.country_name}`,
      location: `${page.city_name}, ${page.country_name}`,
      service: "Google review policy assessment",
      industry: "",
      content: page.page_content,
      related_keywords: [],
      hashtags: data.hashtags,
      translation_group: null,
      updated_at: page.updated_at,
    };
  const head = SEOHead(seoPage, [], {
    canonicalPath,
    breadcrumbs: [
      { name: "Home", url: "https://ratingguard.online/" },
      { name: page.city_name, url: `https://ratingguard.online${canonicalPath}` },
    ],
  });
  const canonical = head.links?.find((link) => link.rel === "canonical")?.href;
  const origin = canonical ? new URL(canonical).origin : "https://ratingguard.online";
  const alternates = data.translations.map((translation) => ({
    rel: "alternate",
    hrefLang: translation.locale,
    href: new URL(translation.path, origin).toString(),
  }));
  if (alternates.length > 1) {
    const defaultPage =
      data.translations.find((translation) => translation.locale === "en-US") ??
      data.translations[0]!;
    alternates.push({
      rel: "alternate",
      hrefLang: "x-default",
      href: new URL(defaultPage.path, origin).toString(),
    });
  }
  return { ...head, links: [...(head.links ?? []), ...alternates] };
}

export function defaultLocationLocale(): SeoLocale {
  return "en-US";
}
