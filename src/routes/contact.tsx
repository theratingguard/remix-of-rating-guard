import { createFileRoute, Link } from "@tanstack/react-router";
import { loadSiteContent } from "@/lib/site-content";

export const Route = createFileRoute("/contact")({
  loader: async () => {
    try { return (await loadSiteContent("published")).content; } catch { return null; }
  },
  head: () => ({
    meta: [
      { title: "Contact — Review Command Center" },
      { name: "description", content: "Get in touch about the Review Command Center, your account or a report." },
      { property: "og:title", content: "Contact — Review Command Center" },
      { property: "og:description", content: "Get in touch about the Review Command Center, your account or a report." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const content = Route.useLoaderData() as { contactEmail?: string } | null;
  const email = content?.contactEmail || "removalwork59@gmail.com";
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <Link to="/" className="text-sm text-primary hover:underline">← Back to home</Link>
      <h1 className="mt-4 text-3xl font-bold">Contact</h1>
      <p className="mt-3 text-muted-foreground">Questions about your account, a scan or a report? Email us and we will reply as soon as we can.</p>
      <section className="surface mt-8 rounded-xl border bg-card p-6">
        <div className="text-sm text-muted-foreground">Email</div>
        <a href={`mailto:${email}`} className="mt-1 block break-all text-lg font-semibold text-primary hover:underline">{email}</a>
        <p className="mt-4 text-xs text-muted-foreground">This Service is independent and not affiliated with Google. We cannot remove reviews; Google makes all policy decisions.</p>
      </section>
    </main>
  );
}
