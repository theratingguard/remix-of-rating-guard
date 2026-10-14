import type { DashboardScanRow } from "@/lib/data";

function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function createScansCsv(scans: DashboardScanRow[]) {
  const rows = [
    [
      "Business Name",
      "Google Maps URL",
      "Rating",
      "Reviews Retrieved",
      "High Risk",
      "Medium Risk",
      "Low Risk",
      "Needs Review",
      "Status",
      "Last Scanned",
    ],
    ...scans.map((scan) => [
      scan.business_name ?? "",
      scan.source_url,
      scan.rating == null ? "" : Number(scan.rating).toFixed(1),
      scan.reviews_retrieved,
      scan.high_count,
      scan.medium_count,
      scan.normal_count,
      scan.requires_review_count,
      scan.status,
      scan.created_at,
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
