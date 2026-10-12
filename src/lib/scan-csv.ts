import type { ScanRow } from "@/lib/data";

function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function exportScansCsv(scans: ScanRow[]) {
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
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `rating-guard-scans-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
