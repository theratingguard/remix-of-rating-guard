import { describe, it, expect } from "vitest";
import { compactDate, groupErrors, groupReports, pageSlice, shortScanError } from "./operations-ui";
import type { ScanRow } from "./data";
describe("Operational UI data helpers", () => {
  it("formats dates on one compact line and exposes exact errors via short labels", () => {
    expect(compactDate("2026-10-11T04:30:25Z")).toBe("11 Oct 2026");
    expect(shortScanError("This link only contains an internal Google CID")).toBe(
      "Business identity unresolved",
    );
    expect(shortScanError("That doesn't look like a valid Google Maps link")).toBe(
      "Invalid link format",
    );
  });
  it("groups reports by identity, never merges different same-name businesses", () => {
    const rows = [
      { id: "1", business_id: "a", business_name: "Same" },
      { id: "2", business_id: "a", business_name: "Same" },
      { id: "3", business_id: "b", business_name: "Same" },
      { id: "4", business_id: null, place_id: null, business_name: "Same" },
    ] as ScanRow[];
    expect(groupReports(rows).map((group) => group.scans.length)).toEqual([2, 1, 1]);
  });
  it("paginates 41 rows without hiding the last record and clamps filter changes", () => {
    const rows = Array.from({ length: 41 }, (_, index) => index);
    expect(pageSlice(rows, 3)).toMatchObject({ page: 3, pages: 3, rows: [40] });
    expect(pageSlice([1], 3)).toMatchObject({ page: 1, pages: 1, rows: [1] });
  });
  it("groups by module and code after filters rather than merging different error categories", () => {
    expect(
      groupErrors([
        { code: "UNSUPPORTED_LINK", module: "google" },
        { code: "UNSUPPORTED_LINK", module: "google" },
        { code: "AI_UNAVAILABLE", module: "ai" },
      ]).map((group) => group.errors.length),
    ).toEqual([2, 1]);
  });
});
