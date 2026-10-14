import { describe, expect, it } from "vitest";
import type { ScanRow } from "./data";
import { createScansCsv } from "./scan-csv";

describe("scan CSV export", () => {
  it("formats scan rows as spreadsheet-safe CSV without starting a browser download", () => {
    const scan = {
      business_name: "=SUM(1,1)",
      source_url: 'https://maps.google.com/?q="quoted"',
      rating: 4.2,
      reviews_retrieved: 5,
      high_count: 1,
      medium_count: 2,
      normal_count: 1,
      requires_review_count: 1,
      status: "complete",
      created_at: "2026-10-14T00:00:00.000Z",
    } as ScanRow;

    expect(createScansCsv([scan])).toBe(
      '\uFEFF"Business Name","Google Maps URL","Rating","Reviews Retrieved","High Risk","Medium Risk","Low Risk","Needs Review","Status","Last Scanned"\r\n' +
        '"\'=SUM(1,1)","https://maps.google.com/?q=""quoted""","4.2","5","1","2","1","1","complete","2026-10-14T00:00:00.000Z"',
    );
  });
});
