import type { RemovalPrediction } from "@/lib/removal-prediction";
import { predictionBand } from "@/lib/removal-prediction";
export function RemovalPredictionPanel({
  prediction,
}: {
  prediction: RemovalPrediction | undefined;
}) {
  if (!prediction)
    return (
      <p className="my-2 text-sm">
        Historical prediction not saved. Upgrade this report to assess available outcome data.
      </p>
    );
  const band = prediction.probability === null ? null : predictionBand(prediction.probability);
  const unavailableLabel =
    prediction.status === "low_confidence"
      ? "Low confidence — not enough cases to show a percentage"
      : prediction.status === "unsupported"
        ? "Not estimable — evidence not supported"
        : "Not estimable";
  return (
    <section className="my-3 rounded border p-3">
      <h4 className="font-semibold" style={{ backgroundColor: band?.color }}>
        Removal prediction:{" "}
        {prediction.probability === null
          ? unavailableLabel
          : `${prediction.probability}% — ${band?.label}`}
      </h4>
      {prediction.interval && (
        <p>
          95% cohort interval: {prediction.interval[0]}–{prediction.interval[1]}%. Median response:{" "}
          {prediction.median_days} days.
        </p>
      )}
      <ul className="list-disc pl-5 text-sm">
        {prediction.basis.map((basis) => (
          <li key={basis}>{basis}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs">
        Snapshot: {new Date(prediction.generated_at).toLocaleString()}.{" "}
        {prediction.unavailable.join(" ")}
      </p>
    </section>
  );
}
