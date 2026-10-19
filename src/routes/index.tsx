import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { HomePage } from "@/components/home-page";
import { DEFAULT_CONTENT, loadSiteContent } from "@/lib/site-content";
import { APP_URL } from "@/lib/config";

const SEO_KEYWORDS = [
  "Rating Guard",
  "Google review removal",
  "review removal",
  "Google reviews",
  "negative reviews",
  "bad reviews",
  "fake reviews",
  "review management",
  "Google review management",
  "reputation management",
  "online reputation",
  "online reputation management",
  "business reputation",
  "review monitoring",
  "review protection",
  "review audit",
  "review dispute",
  "review recovery",
  "reputation repair",
  "digital reputation",
  "Google Business Profile",
  "Google Maps reviews",
  "Google Maps SEO",
  "local SEO",
  "local business SEO",
  "Google My Business",
  "business listing",
  "local search",
  "SEO agency",
  "SEO experts",
  "digital marketing",
  "search visibility",
  "Google ranking",
  "local marketing",
  "business growth",
  "online visibility",
  "customer feedback",
  "customer reviews",
  "review analytics",
  "brand protection",
  "dentist marketing",
  "dental clinic",
  "healthcare marketing",
  "medical practice",
  "doctors marketing",
  "hospital marketing",
  "cosmetic clinic",
  "dermatology clinic",
  "law firm marketing",
  "lawyers",
  "legal marketing",
  "real estate marketing",
  "real estate agents",
  "accountant marketing",
  "consulting business",
  "professional services",
  "clinic management",
  "patient experience",
  "medical reputation",
  "attorney marketing",
  "hotel marketing",
  "hotel reputation",
  "hospitality marketing",
  "restaurant marketing",
  "restaurant reviews",
  "cafe marketing",
  "food business",
  "travel agency",
  "tourism marketing",
  "resort marketing",
  "guest house",
  "cloud kitchen",
  "hotel management",
  "customer experience",
  "hospitality business",
  "home services",
  "plumbing business",
  "electrician business",
  "HVAC business",
  "contractor marketing",
  "auto repair shop",
  "car dealership",
  "automotive marketing",
  "salon marketing",
  "beauty business",
  "spa marketing",
  "gym marketing",
  "retail marketing",
  "small business marketing",
  "local business",
  "business owners",
  "small business growth",
  "brand reputation",
  "customer trust",
  "reputation consulting",
].join(", ");

export const Route = createFileRoute("/")({
  validateSearch: (s) => z.object({ preview: z.enum(["draft"]).optional() }).parse(s),
  loaderDeps: ({ search }) => ({ preview: search.preview }),
  loader: async ({ deps }) => {
    if (deps.preview === "draft") throw redirect({ to: "/homepage-preview" });
    try {
      return (await loadSiteContent("published")).content;
    } catch (error) {
      console.error("[homepage] Published content unavailable", error);
      return DEFAULT_CONTENT;
    }
  },
  head: ({ loaderData }) => {
    const c = loaderData ?? DEFAULT_CONTENT;
    const faq = c.faq.filter((f) => f.visible);
    return {
      meta: [
        { title: c.seoTitle },
        { name: "description", content: c.seoDescription },
        { name: "keywords", content: SEO_KEYWORDS },
        { property: "og:title", content: c.seoTitle },
        { property: "og:description", content: c.seoDescription },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: c.seoTitle },
        { name: "twitter:description", content: c.seoDescription },
      ],
      links: APP_URL ? [{ rel: "canonical", href: APP_URL }] : [],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        },
      ],
    };
  },
  component: Home,
});

function Home() {
  const c = Route.useLoaderData();
  const { preview } = Route.useSearch();
  return <HomePage c={c} preview={!!preview} />;
}
