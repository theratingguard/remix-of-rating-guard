import { createFileRoute } from "@tanstack/react-router";
import { SimpleScanReport } from "@/components/simple-scan-report";

export const Route = createFileRoute("/_authenticated/scan-report/$id")({
  head: () => ({ meta: [{ title: "Scan Report — Rating Guard" }] }),
  component: SimpleScanReportRoute,
});

function SimpleScanReportRoute() {
  const { id } = Route.useParams();
  return <SimpleScanReport scanId={id} />;
}
