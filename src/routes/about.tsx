import { createFileRoute, Link } from "@tanstack/react-router";
import { SEOHead } from "@/lib/seo/seo-head";

const ABOUT_FAQS = [
  {
    question: "Can Rating Guard guarantee that Google will remove a review?",
    answer:
      "No. Rating Guard helps organize review information and evidence, but Google independently applies its policies and decides whether to take action.",
  },
  {
    question: "Is Rating Guard part of Google?",
    answer:
      "No. Rating Guard is an independent service and is not affiliated with Google.",
  },
  {
    question: "Where does Rating Guard operate?",
    answer:
      "Rating Guard is available online at ratingguard.online. Contact the team to confirm current product availability for your location.",
  },
];

export const Route = createFileRoute("/about")({
  head: () =>
    SEOHead(
      {
        title: "About Rating Guard",
        description:
          "Learn how Rating Guard helps businesses assess Google review concerns, organize evidence, and manage review workflows responsibly.",
        content: {
          intro: "",
          sections: [],
          faqs: ABOUT_FAQS,
        },
      },
      [],
      {
        canonicalPath: "/about",
        breadcrumbs: [
          { name: "Home", url: "https://ratingguard.online/" },
          { name: "About", url: "https://ratingguard.online/about" },
        ],
      },
    ),
  component: AboutPage,
});

function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-10 px-6 py-16">
      <header className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">About</p>
        <h1 className="text-4xl font-bold tracking-tight text-foreground">About Rating Guard</h1>
        <p className="text-lg leading-8 text-muted-foreground">
          Rating Guard is an online service that helps businesses assess potentially
          policy-relevant Google reviews, organize supporting evidence, and manage review-related
          workflows.
        </p>
      </header>
      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">How the service works</h2>
        <p className="leading-7 text-muted-foreground">
          The product provides review scanning and analysis tools, evidence organization, and
          reporting workflows. These tools support a business’s own review of available information;
          they do not determine whether a review violates Google policy.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">Our approach</h2>
        <p className="leading-7 text-muted-foreground">
          We aim to make review concerns easier to assess by keeping evidence and workflow context
          together. Users should verify findings against current platform policies and original
          evidence before taking action. We do not promise review removal or a particular outcome.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">Independence and limitations</h2>
        <p className="leading-7 text-muted-foreground">
          Rating Guard is independent and is not affiliated with Google. Google makes all final
          decisions under its policies. The site does not claim specific offices, professional
          credentials, or country coverage unless separately confirmed.
        </p>
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-foreground">Contact and policies</h2>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-primary">
          <li><Link to="/contact" className="hover:underline">Contact</Link></li>
          <li><Link to="/terms" className="hover:underline">Terms</Link></li>
          <li><Link to="/privacy" className="hover:underline">Privacy</Link></li>
        </ul>
      </section>
      <section className="space-y-5">
        <h2 className="text-2xl font-semibold text-foreground">Common questions</h2>
        {ABOUT_FAQS.map((faq) => (
          <div key={faq.question} className="space-y-2">
            <h3 className="font-semibold text-foreground">{faq.question}</h3>
            <p className="leading-7 text-muted-foreground">{faq.answer}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
