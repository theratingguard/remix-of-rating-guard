import type { ScanRow } from "./data";
export function compactDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
export function shortScanError(error: string) {
  if (/CID|business identity|no nearby business|exact business/i.test(error))
    return "Business identity unresolved";
  if (/invalid|isn't a Google|doesn't look|supported HTTPS|couldn't find a business/i.test(error))
    return "Invalid link format";
  if (/credit|billing|quota/i.test(error)) return "Provider billing / quota";
  if (/AI|model|analysis|consensus/i.test(error)) return "AI analysis unavailable";
  if (/time|network|reach|DNS|redirect/i.test(error)) return "Connection / URL resolution failed";
  return error.length > 45 ? `${error.slice(0, 42)}...` : error;
}
export function groupReports(rows: ScanRow[]) {
  const groups = new Map<string, ScanRow[]>();
  for (const row of rows) {
    const key = row.business_id || row.place_id || `scan:${row.id}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups].map(([id, scans]) => ({
    id,
    name: scans[0]?.business_name ?? "Unknown business",
    scans,
  }));
}
export function pageSlice<T>(rows: T[], requested: number, size = 20) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.max(1, Math.min(requested, pages));
  return { page, pages, rows: rows.slice((page - 1) * size, page * size) };
}
export function groupErrors<T extends { code: string; module: string }>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.module}:${row.code}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups].map(([key, errors]) => ({ key, code: errors[0]!.code, errors }));
}
