import { createFileRoute, notFound } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/lib/seo/seo-head";
import { createDirectAnswer } from "@/lib/seo/direct-answer";
import { relatedPillarGuides } from "@/lib/seo/pillar-guides";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from("blog_posts")
      .select("title,slug,content,meta_description,published_at,updated_at")
      .eq("slug", params.slug)
      .eq("status", "published")
      .not("published_at", "is", null)
      .maybeSingle();
    if (error) throw new Error(`Could not load the published blog post: ${error.message}`);
    if (!data?.published_at) throw notFound();
    const firstParagraph =
      data.content
        .split(/\r?\n\s*\r?\n/)
        .map((paragraph) => paragraph.trim())
        .find(Boolean) ?? "";
    return { ...data, directAnswer: createDirectAnswer(data.title, firstParagraph) };
  },
  head: ({ loaderData }) =>
    loaderData
      ? SEOHead({ title: loaderData.title, description: loaderData.meta_description }, [], {
          canonicalPath: `/blog/${encodeURIComponent(loaderData.slug)}`,
          contentType: "article",
          article: {
            publishedAt: loaderData.published_at!,
            updatedAt: loaderData.updated_at,
          },
          speakable: true,
          breadcrumbs: [
            { name: "Home", url: "https://ratingguard.online/" },
            { name: "Blog", url: "https://ratingguard.online/blog" },
            {
              name: loaderData.title,
              url: `https://ratingguard.online/blog/${encodeURIComponent(loaderData.slug)}`,
            },
          ],
        })
      : {},
  component: BlogArticlePage,
});

function BlogArticlePage() {
  const post = Route.useLoaderData();
  const relatedGuides = relatedPillarGuides(`${post.title}\n${post.content}`);
  const paragraphs = post.content
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <article className="space-y-8">
        <header className="space-y-4">
          <a href="/blog" className="text-sm font-medium text-primary hover:underline">
            ← Rating Guard Blog
          </a>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">{post.title}</h1>
          <p
            id="direct-answer"
            className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-base leading-7 text-foreground"
          >
            {post.directAnswer}
          </p>
          {post.published_at && (
            <time dateTime={post.published_at} className="text-sm text-muted-foreground">
              {new Date(post.published_at).toLocaleDateString()}
            </time>
          )}
        </header>
        <div className="space-y-5 text-base leading-8 text-muted-foreground">
          {paragraphs.map((paragraph, index) => (
            <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
          ))}
        </div>
        {relatedGuides.length > 0 && (
          <nav
            aria-labelledby="related-guides-heading"
            className="space-y-3 border-t border-border pt-6"
          >
            <h2 id="related-guides-heading" className="text-xl font-semibold text-foreground">
              Related practical guides
            </h2>
            <ul className="space-y-2">
              {relatedGuides.map((guide) => (
                <li key={guide.slug}>
                  <a
                    className="text-primary underline-offset-4 hover:underline"
                    href={`/guides/${guide.slug}`}
                  >
                    {guide.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <aside className="rounded-xl border border-border bg-muted/40 p-5 text-sm leading-6 text-muted-foreground">
          Google makes all final decisions about its review policies. Rating Guard does not
          guarantee that any review will be removed.
        </aside>
      </article>
    </main>
  );
}
