import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Review Command Center" },
      { name: "description", content: "How the Review Command Center collects, uses, stores and protects your data." },
      { property: "og:title", content: "Privacy Policy — Review Command Center" },
      { property: "og:description", content: "How the Review Command Center collects, uses, stores and protects your data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

const sections: { h: string; body: string[] }[] = [
  {
    h: "1. Who we are",
    body: [
      "Review Command Center (“the Service”) is operated by Removal Work Solution, reachable at removalwork59@gmail.com. This policy explains what data we handle when you use the Service.",
      "The Service is an independent tool. It is not affiliated with, endorsed by, or sponsored by Google.",
    ],
  },
  {
    h: "2. Data we collect",
    body: [
      "Account data: your email address, display name, username and profile photo, used to sign you in and identify your account.",
      "Scan data: the Google Maps or Business Profile links you submit, the business details and reviews returned by the Google Places API, and the analysis results and reports generated from them.",
      "Usage data: sign-in times, scan activity and administrative actions, recorded in an activity log for security and audit purposes.",
      "Technical data: standard server logs (IP address, browser type, timestamps) used to keep the Service secure and reliable.",
    ],
  },
  {
    h: "3. How we use your data",
    body: [
      "To provide the Service: fetching publicly available review data, running risk analysis, and generating reports you request.",
      "To secure the Service: authentication, abuse prevention and audit logging.",
      "To communicate with you about your account when necessary.",
      "We do not sell your data, and we do not use your scan data to advertise to you.",
    ],
  },
  {
    h: "4. Review data from Google",
    body: [
      "Reviews and business details are retrieved from the Google Places API at your request. Google may limit how many reviews are available; we only ever show data actually returned by the API, never invented data.",
      "Reviews are the public content of their authors. We store copies of retrieved reviews so your reports remain consistent; we do not claim ownership of them.",
    ],
  },
  {
    h: "5. AI processing",
    body: [
      "Review text is processed by AI models to assess policy-relevant risk and to draft reply suggestions when you ask for them. AI output is stored separately from the original review data.",
      "AI suggestions are drafts for your review. Nothing is posted, reported or sent automatically.",
    ],
  },
  {
    h: "6. Data retention and deletion",
    body: [
      "Scan data, analyses and reports are kept until you delete them or close your account.",
      "You may request deletion of your account and associated data at any time by contacting removalwork59@gmail.com.",
    ],
  },
  {
    h: "7. Security",
    body: [
      "Passwords are stored only as secure hashes and are never visible to anyone, including us. Access to the Service is restricted to authenticated users, and database access is protected by row-level security rules.",
    ],
  },
  {
    h: "8. Your rights",
    body: [
      "You can view and edit your profile details in the app, request a copy of your data, and request correction or deletion by contacting us.",
    ],
  },
  {
    h: "9. Changes to this policy",
    body: [
      "If we change this policy, the updated version will be posted on this page with a revised date. Continued use of the Service after a change means you accept the updated policy.",
    ],
  },
  {
    h: "10. Contact",
    body: ["Questions about this policy: removalwork59@gmail.com."],
  },
];

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-card-border bg-card/60">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link to="/" className="font-bold text-primary">Review Intelligence</Link>
          <Link to="/terms" className="text-sm text-muted-foreground hover:text-foreground">Terms of Service</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: October 2026</p>
        <div className="mt-8 space-y-8">
          {sections.map((s) => (
            <section key={s.h} className="surface p-6">
              <h2 className="text-lg font-semibold">{s.h}</h2>
              <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
                {s.body.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
