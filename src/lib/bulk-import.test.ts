import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  parseBusinessCsv,
  importBusinessRows,
  extractBusinessSpreadsheet,
  MAX_BULK_INPUTS,
} from "./bulk-import";
describe("Business CSV/Excel import", () => {
  it("accepts exactly 1,001 business rows and preserves quoted commas, Unicode and duplicate preview", () => {
    const rows = Array.from({ length: 1001 }, (_, index) => `"Hotel ${index}, Taj","Mumbai",`);
    const result = parseBusinessCsv(`Business Name,City,Google Maps URL\n${rows.join("\n")}`);
    expect(result.rows).toBe(1001);
    expect(result.text.split("\n")).toHaveLength(1001);
    expect(result.text.split("\n")[0]).toBe("Hotel 0, Taj Mumbai");
    expect(parseBusinessCsv("Business Name,City\nहोटल,मुंबई\nहोटल,मुंबई").duplicates).toBe(1);
  });
  it("prefers Maps URL; accepts alternate headers and rejects malformed URL without discarding rows", () => {
    expect(
      parseBusinessCsv(
        "\uFEFFBusiness_Name,City,Google_Maps_URL\nHotel,Mumbai,https://share.google/AbCdEf",
      ).text,
    ).toBe("https://share.google/AbCdEf");
    expect(() =>
      parseBusinessCsv(
        "Business Name,City,Google Maps URL\nHotel,Mumbai,https://evil.invalid\nCafe,Delhi,",
      ),
    ).toThrow("Row 2");
  });
  it("enforces exact 5,000 boundary, requires city/name or URL and rejects formulas", () => {
    const rows = [
      ["Business Name", "City"],
      ...Array.from({ length: MAX_BULK_INPUTS }, (_, i) => [`Hotel ${i}`, "City"]),
    ];
    expect(importBusinessRows(rows).rows).toBe(5000);
    expect(() => importBusinessRows([...rows, ["Extra", "City"]])).toThrow("Maximum");
    expect(() => parseBusinessCsv("Business Name,City\nHotel,")).toThrow("Row 2");
    expect(() => parseBusinessCsv("Business Name,City\n=cmd(),Delhi")).toThrow("formula");
    expect(() => parseBusinessCsv("Wrong,Columns\nHotel,Delhi")).toThrow("Required");
    expect(() => parseBusinessCsv('Business Name,City\n"unterminated,Delhi')).toThrow("CSV parse");
  });
  it("imports a real 1,001-row XLSX worksheet, not just CSV renamed as Excel", async () => {
    const book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet("Businesses");
    sheet.addRow(["Business Name", "City", "Google Maps URL"]);
    for (let i = 0; i < 1001; i++) sheet.addRow([`Cafe ${i}`, "Delhi", null]);
    const bytes = await book.xlsx.writeBuffer();
    const file = {
      name: "businesses.xlsx",
      size: bytes.byteLength,
      arrayBuffer: async () => Uint8Array.from(new Uint8Array(bytes)).buffer,
    } as File;
    const result = await extractBusinessSpreadsheet(file);
    expect(result.rows).toBe(1001);
    expect(result.text.split("\n").at(-1)).toBe("Cafe 1000 Delhi");
  });
  it("rejects XLSX formulas, multiple sheets, legacy XLS and oversized files", async () => {
    const book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet("Businesses");
    sheet.addRow(["Business Name", "City"]);
    sheet.addRow([{ formula: '"Hotel"', result: "Hotel" }, "City"]);
    const bytes = await book.xlsx.writeBuffer();
    const file = {
      name: "formula.xlsx",
      size: bytes.byteLength,
      arrayBuffer: async () => Uint8Array.from(new Uint8Array(bytes)).buffer,
    } as File;
    await expect(extractBusinessSpreadsheet(file)).rejects.toThrow("formulas");
    await expect(
      extractBusinessSpreadsheet({ name: "legacy.xls", size: 10 } as File),
    ).rejects.toThrow("legacy");
    await expect(
      extractBusinessSpreadsheet({ name: "large.xlsx", size: 11 * 1024 * 1024 } as File),
    ).rejects.toThrow("10 MB");
    book.addWorksheet("Other").addRow(["Business"]);
    const more = await book.xlsx.writeBuffer();
    await expect(
      extractBusinessSpreadsheet({
        ...file,
        arrayBuffer: async () => Uint8Array.from(new Uint8Array(more)).buffer,
      } as File),
    ).rejects.toThrow("one non-empty");
  });
});
