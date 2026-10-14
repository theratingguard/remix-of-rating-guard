import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScanRow } from "@/lib/data";

const api = vi.hoisted(() => ({ saveCsv: vi.fn() }));

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/storage.functions", () => ({ uploadStorageFile: api.saveCsv }));

import { ScansCsvExportButton } from "./scans-csv-export-button";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("scans CSV VPS export", () => {
  it("uploads encoded CSV to private storage and exposes the returned URL, not a PC download", async () => {
    api.saveCsv.mockResolvedValue({
      folder: "reports/owner",
      url: "/api/storage/download?folder=reports%2Fowner&filename=scans.csv",
    });
    const scan = {
      business_name: "Fixture Business",
      source_url: "https://maps.google.com/?q=fixture",
      rating: 4.2,
      reviews_retrieved: 5,
      high_count: 1,
      medium_count: 0,
      normal_count: 4,
      requires_review_count: 0,
      status: "complete",
      created_at: "2026-10-14T00:00:00.000Z",
    };
    render(<ScansCsvExportButton scans={[scan as ScanRow]} label="Save CSV to VPS" />);

    fireEvent.click(screen.getByRole("button", { name: "Save CSV to VPS" }));

    await waitFor(() => expect(api.saveCsv).toHaveBeenCalledOnce());
    const request = api.saveCsv.mock.calls[0]?.[0] as
      | { data: { folder: string; filename: string; contentType: string; base64: string } }
      | undefined;
    expect(request?.data).toMatchObject({
      folder: "reports",
      contentType: "text/csv;charset=utf-8",
    });
    expect(request?.data.filename).toMatch(/^scans-2026-10-14-.+\.csv$/);
    const csv = new TextDecoder().decode(
      Uint8Array.from(atob(request?.data.base64 ?? ""), (char) => char.charCodeAt(0)),
    );
    expect(csv).toContain('"Fixture Business"');
    expect(screen.getByRole("link", { name: "Open or download CSV" })).toHaveAttribute(
      "href",
      "/api/storage/download?folder=reports%2Fowner&filename=scans.csv",
    );
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
