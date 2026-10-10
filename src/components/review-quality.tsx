import type { ReviewQuality } from "@/lib/review-quality";
import { readinessBand } from "@/lib/review-quality";

export function ReviewQualityPanel({ quality }: { quality: ReviewQuality }) {
  const band = readinessBand(quality.total);
  return (
    <section className="my-3 rounded border p-3">
      <h4 className="font-semibold">Legal strength / evidence readiness: {quality.total}/100</h4>
      <p>
        {band.label} — partial assessment ({quality.assessed}/5 parameters assessed).
      </p>
      <p className="text-sm text-muted-foreground">
        Not a removal likelihood or guarantee. Unknown parameters are unavailable, not invented
        scores.
      </p>
      <dl className="my-2">
        {quality.components.map((component) => (
          <div key={component.name} className="my-2">
            <dt className="font-semibold">
              {component.name}: {component.score === null ? "Unavailable" : `${component.score}/20`}
            </dt>
            <dd className="text-sm">{component.basis}</dd>
          </div>
        ))}
      </dl>
      <h4 className="font-semibold">Evidence collection — fetched sample only</h4>
      <ul className="list-disc pl-5">
        {quality.findings.map((finding) => (
          <li key={finding}>{finding}</li>
        ))}
      </ul>
      <details className="mt-2">
        <summary>Missing evidence and limitations</summary>
        <ul className="list-disc pl-5">
          {quality.unavailable.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
