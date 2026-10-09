import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { HomePage } from "@/components/home-page";
import { DEFAULT_CONTENT, loadSiteContent } from "@/lib/site-content";
import { APP_URL } from "@/lib/config";

export const Route = createFileRoute("/")({
  validateSearch: (s) => z.object({ preview: z.enum(["draft"]).optional() }).parse(s),
  loaderDeps: ({ search }) => ({ preview: search.preview }),
  loader: async ({ deps }) => {
    try { return (await loadSiteContent(deps.preview === "draft" ? "draft" : "published")).content; }
    catch { return DEFAULT_CONTENT; }
  },
  head: ({ loaderData }) => {
    const c = loaderData ?? DEFAULT_CONTENT;
    const faq = c.faq.filter((f) => f.visible);
    return {
      meta: [
        { title: c.seoTitle },
        { name: "description", content: c.seoDescription },
        { property: "og:title", content: c.seoTitle },
        { property: "og:description", content: c.seoDescription },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: c.seoTitle },
        { name: "twitter:description", content: c.seoDescription },
      ],
      links: APP_URL ? [{ rel: "canonical", href: APP_URL }] : [],
      scripts: [{ type: "application/ld+json", children: JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }) }],
    };
  },
  component: Home,
});

function Home() {
  const c = Route.useLoaderData();
  const { preview } = Route.useSearch();
  return <HomePage c={c} preview={!!preview} />;
}
