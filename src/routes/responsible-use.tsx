import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/responsible-use")({
  head: () => ({
    meta: [
      { title: "Responsible Use — Review Command Center" },
      { name: "description", content: "How to use the Review Command Center responsibly and in line with Google's review policies." },
      { property: "og:title", content: "Responsible Use — Review Command Center" },
      { property: "og:description", content: "How to use the Review Command Center responsibly and in line with Google's review policies." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const points = [
  ["AI is an assessment, not a verdict", "Risk levels, reasons and evidence are AI-assisted assessments. Google alone makes the final policy and removal decision."],
  ["Negative is not a violation", "A low rating or critical opinion is not automatically a policy violation. Honest negative feedback should be answered, not reported."],
  ["Use the official path only", "Flag content only through Google's official reporting tools, and only when you genuinely believe it breaks Google's policies."],
  ["No guarantees", "We do not promise that any review will be removed, and we are not affiliated with Google."],
  ["Review before acting", "Read the original review and the evidence yourself. Items marked 'Requires manual review' need human judgement."],
  ["Replies are drafts", "AI reply suggestions are never posted automatically. Edit them so they are accurate, respectful and your own."],
  ["Data availability", "Results depend on the reviews Google makes available through its API, which may be a limited subset."],
];

function Page() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <Link to="/" className="text-sm text-primary hover:underline">← Back to home</Link>
      <h1 className="mt-4 text-3xl font-bold">Responsible Use</h1>
      <p className="mt-3 text-muted-foreground">Principles for using this Service fairly and in line with Google's policies.</p>
      <div className="mt-8 space-y-4">
        {points.map(([h, b]) => (
          <section key={h} className="surface rounded-xl border bg-card p-5">
            <h2 className="font-semibold">{h}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{b}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
