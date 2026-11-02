import { APP_NAME } from "@/lib/config";
import { SEO_LOCALES } from "./locales";
import { generateCountrySeoKeywords } from "./country-keywords";
import { youtubeVideoId } from "./youtube";

const DEFAULT_ORIGIN = "https://ratingguard.online";
const DEFAULT_IMAGE = `${DEFAULT_ORIGIN}/logo.svg`;

export type SeoFaq = { question: string; answer: string };
export type SeoSection = { heading: string; body: string };
export type SeoLocalBusiness = {
  name: string;
  url?: string;
  telephone?: string;
  address: {
    streetAddress?: string;
    addressLocality: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry: string;
  };
};
export type SeoVideo = {
  youtubeUrl: string;
  name: string;
  description: string;
  uploadDate: string;
  duration: string;
};
export type ProgrammaticSeoPage = {
  keyword: string;
  locale: string;
  slug: string;
  title: string;
  description: string;
  location: string;
  service: string;
  industry: string;
  content: {
    intro: string;
    sections: SeoSection[];
    faqs: SeoFaq[];
    localBusiness?: SeoLocalBusiness;
    video?: SeoVideo;
  };
  related_keywords: string[];
  hashtags: string[];
  translation_group: string | null;
  updated_at: string;
};

export type SeoBreadcrumb = { name: string; url: string };
export type SeoHeadOptions = {
  canonicalPath?: string;
  contentType?: "website" | "article";
  breadcrumbs?: SeoBreadcrumb[];
  article?: {
    publishedAt: string;
    updatedAt?: string | null;
    authorName?: string;
  };
  organization?: {
    sameAs?: string[];
    founder?: string;
    foundingDate?: string;
  };
  speakable?: boolean;
  video?: SeoVideo;
};

export function organizationJsonLd(origin: string, options: SeoHeadOptions["organization"] = {}) {
  const officialProfiles = (options?.sameAs ?? []).filter((profile) => {
    try {
      return new URL(profile).protocol === "https:";
    } catch {
      return false;
    }
  });
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name: APP_NAME,
    url: origin,
    logo: DEFAULT_IMAGE,
    email: "theratingguard@gmail.com",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "theratingguard@gmail.com",
      url: `${origin}/contact`,
    },
    ...(officialProfiles.length ? { sameAs: officialProfiles } : {}),
    ...(options?.founder ? { founder: options.founder } : {}),
    ...(options?.foundingDate ? { foundingDate: options.foundingDate } : {}),
  };
}

export function websiteJsonLd(origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: APP_NAME,
    url: origin,
  };
}

function siteOrigin() {
  const configured = import.meta.env["VITE_PUBLIC_APP_URL"] || DEFAULT_ORIGIN;
  const url = new URL(configured);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))
    return DEFAULT_ORIGIN;
  return url.origin;
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function SEOHead(
  page: Partial<ProgrammaticSeoPage> & Pick<ProgrammaticSeoPage, "title" | "description">,
  translations: Array<Pick<ProgrammaticSeoPage, "locale" | "slug">> = [],
  options: SeoHeadOptions = {},
) {
  const origin = siteOrigin();
  const path =
    options.canonicalPath ??
    (page.locale && page.slug
      ? `/${encodeURIComponent(page.locale)}/service/${encodeURIComponent(page.slug)}`
      : "/");
  const canonical = new URL(path, origin).toString();
  const image = DEFAULT_IMAGE;
  const organizationSchema = organizationJsonLd(origin, options.organization);
  const websiteSchema = websiteJsonLd(origin);
  const keywords = [
    page.keyword ?? "",
    ...(page.related_keywords ?? []),
    "Rating Guard",
    "Google review management",
    "online reputation management",
    ...(page.locale ? generateCountrySeoKeywords(page.locale) : []),
  ]
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .filter((keyword, index, all) => all.indexOf(keyword) === index);
  const hashtags = (page.hashtags ?? [])
    .filter((hashtag) => /^#[A-Za-z][A-Za-z0-9]{1,31}$/.test(hashtag))
    .filter((hashtag, index, all) => all.indexOf(hashtag) === index)
    .slice(0, 5);
  const alternateRows =
    translations.length && page.locale
      ? translations
      : page.locale && page.slug
        ? [{ locale: page.locale, slug: page.slug }]
        : [];
  const alternates = alternateRows.map((translation) => ({
    rel: "alternate",
    hrefLang: translation.locale,
    href: new URL(
      `/${encodeURIComponent(translation.locale)}/service/${encodeURIComponent(translation.slug)}`,
      origin,
    ).toString(),
  }));
  if (alternateRows.length > 0) {
    const defaultTranslation =
      alternateRows.find((translation) => translation.locale === "en-US") ?? alternateRows[0]!;
    alternates.push({
      rel: "alternate",
      hrefLang: "x-default",
      href: new URL(
        `/${encodeURIComponent(defaultTranslation.locale)}/service/${encodeURIComponent(defaultTranslation.slug)}`,
        origin,
      ).toString(),
    });
  }
  const softwareSchema = page.locale
    ? {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: APP_NAME,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: canonical,
        description: page.description,
      }
    : null;
  const faqSchema =
    page.content && page.content.faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: page.content.faqs.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: { "@type": "Answer", text: faq.answer },
          })),
        }
      : null;
  const localBusiness = page.content?.localBusiness;
  const localBusinessSchema = localBusiness
    ? {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        name: localBusiness.name,
        url: localBusiness.url,
        telephone: localBusiness.telephone,
        address: {
          "@type": "PostalAddress",
          ...localBusiness.address,
        },
      }
    : null;
  const articleSchema =
    options.article && options.contentType === "article"
      ? {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: page.title,
          description: page.description,
          mainEntityOfPage: canonical,
          datePublished: options.article.publishedAt,
          dateModified: options.article.updatedAt ?? options.article.publishedAt,
          author: {
            "@type": "Organization",
            name: options.article.authorName ?? APP_NAME,
          },
          publisher: { "@type": "Organization", name: APP_NAME },
          ...(options.speakable
            ? {
                speakable: {
                  "@type": "SpeakableSpecification",
                  cssSelector: ["#direct-answer", "article h1"],
                },
              }
            : {}),
        }
      : null;
  const videoId = options.video ? youtubeVideoId(options.video.youtubeUrl) : null;
  const videoSchema =
    options.video && videoId
      ? {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name: options.video.name,
          description: options.video.description,
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          uploadDate: options.video.uploadDate,
          duration: options.video.duration,
          embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
          contentUrl: `https://www.youtube.com/watch?v=${videoId}`,
        }
      : null;
  const breadcrumbs =
    options.breadcrumbs ??
    (page.locale && page.slug
      ? [
          { name: "Home", url: new URL("/", origin).toString() },
          { name: page.title, url: canonical },
        ]
      : []);
  const breadcrumbSchema =
    breadcrumbs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: breadcrumbs.map((breadcrumb, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: breadcrumb.name,
            item: breadcrumb.url,
          })),
        }
      : null;

  return {
    meta: [
      { title: page.title },
      { name: "description", content: page.description.slice(0, 160) },
      { name: "keywords", content: keywords.join(", ") },
      { name: "robots", content: "index,follow,max-image-preview:large" },
      { property: "og:title", content: page.title },
      { property: "og:description", content: page.description.slice(0, 160) },
      { property: "og:type", content: options.contentType ?? "website" },
      { property: "og:url", content: canonical },
      { property: "og:image", content: image },
      { property: "og:image:alt", content: `${page.title} — ${APP_NAME}` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: page.title },
      { name: "twitter:description", content: page.description.slice(0, 160) },
      { name: "twitter:image", content: image },
      ...(hashtags.length
        ? [
            { name: "hashtags", content: hashtags.join(", ") },
            ...hashtags.map((hashtag) => ({ property: "article:tag", content: hashtag })),
          ]
        : []),
    ],
    links: [
      { rel: "canonical", href: canonical },
      ...alternates.filter(
        (alternate) =>
          SEO_LOCALES.some((locale) => locale.code === alternate.hrefLang) ||
          alternate.hrefLang === "x-default",
      ),
    ],
    scripts: [
      { type: "application/ld+json", children: safeJson(organizationSchema) },
      { type: "application/ld+json", children: safeJson(websiteSchema) },
      ...(softwareSchema
        ? [{ type: "application/ld+json", children: safeJson(softwareSchema) }]
        : []),
      ...(faqSchema ? [{ type: "application/ld+json", children: safeJson(faqSchema) }] : []),
      ...(localBusinessSchema
        ? [{ type: "application/ld+json", children: safeJson(localBusinessSchema) }]
        : []),
      ...(articleSchema
        ? [{ type: "application/ld+json", children: safeJson(articleSchema) }]
        : []),
      ...(videoSchema ? [{ type: "application/ld+json", children: safeJson(videoSchema) }] : []),
      ...(breadcrumbSchema
        ? [{ type: "application/ld+json", children: safeJson(breadcrumbSchema) }]
        : []),
    ],
  };
}

export function localizedSeoPath(locale: string, slug: string) {
  return `/${encodeURIComponent(locale)}/service/${encodeURIComponent(slug)}`;
}
