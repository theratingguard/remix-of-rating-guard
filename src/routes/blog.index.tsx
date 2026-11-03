import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/lib/seo/seo-head";
import { PILLAR_GUIDES } from "@/lib/seo/pillar-guides";

export const Route = createFileRoute("/blog/")({
  loader: async () => {
    const { data, error } = await supabase
      .from("blog_posts")
      .select("title,slug,meta_description,published_at")
      .eq("status", "published")
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(`Could not load published blog posts: ${error.message}`);
    return data ?? [];
  },
  head: () =>
    SEOHead(
      {
        title: "Review Management Blog | Rating Guard",
        description:
          "Practical guidance on Google review policies, evidence-based reputation management, and responsible business review workflows.",
      },
      [],
      {
        canonicalPath: "/blog",
        breadcrumbs: [
          { name: "Home", url: "https://ratingguard.online/" },
          { name: "Blog", url: "https://ratingguard.online/blog" },
        ],
      },
    ),
  component: BlogIndexPage,
});

function BlogIndexPage() {
  const posts = Route.useLoaderData();
  return (
    <main className="mx-auto max-w-4xl space-y-10 px-6 py-16">
      <header className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">Rating Guard Blog</h1>
        <p className="text-lg leading-8 text-muted-foreground">
          Evidence-led guidance for understanding Google review policies and managing business
          reputation responsibly.
        </p>
      </header>
      <section aria-labelledby="guides-heading" className="space-y-4">
        <h2 id="guides-heading" className="text-2xl font-semibold text-foreground">
          Practical guides
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {PILLAR_GUIDES.map((guide) => (
            <li key={guide.slug}>
              <a
                href={`/guides/${guide.slug}`}
                className="block h-full rounded-xl border border-border p-5 hover:bg-muted/50"
              >
                <h3 className="font-semibold text-primary">{guide.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{guide.description}</p>
              </a>
            </li>
          ))}
        </ul>
      </section>
      {posts.length === 0 ? (
        <p className="rounded-lg border border-border p-6 text-muted-foreground">
          New articles are being prepared. Please check back soon.
        </p>
      ) : (
        <ul className="space-y-5">
          {posts.map((post) => (
            <li key={post.slug} className="rounded-xl border border-border p-6">
              <article className="space-y-3">
                {post.published_at && (
                  <time dateTime={post.published_at} className="text-sm text-muted-foreground">
                    {new Date(post.published_at).toLocaleDateString()}
                  </time>
                )}
                <h2 className="text-2xl font-semibold">
                  <Link
                    to="/blog/$slug"
                    params={{ slug: post.slug }}
                    className="text-primary hover:underline"
                  >
                    {post.title}
                  </Link>
                </h2>
                <p className="leading-7 text-muted-foreground">{post.meta_description}</p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
