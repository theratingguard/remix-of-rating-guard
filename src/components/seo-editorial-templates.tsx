import { Card, CardContent } from "@/components/ui/card";
import { EDITORIAL_TEMPLATES } from "@/lib/seo/editorial-templates";

export function SeoEditorialTemplates() {
  return (
    <Card>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div>
          <h3 className="font-semibold">Human-reviewed editorial templates</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Adapt these examples only when relevant and permitted. They are not bulk-posting
            scripts; disclose affiliation, follow each community’s rules, and do not invent customer
            outcomes.
          </p>
        </div>
        <div className="space-y-3">
          {EDITORIAL_TEMPLATES.map((item) => (
            <details key={item.id} className="rounded-lg border p-4">
              <summary className="cursor-pointer font-semibold">
                {item.channel}: {item.title}
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{item.disclosure}</p>
              <pre className="mt-3 whitespace-pre-wrap rounded-md bg-muted/50 p-3 font-sans text-sm leading-6">
                {item.template}
              </pre>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {item.checklist.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
