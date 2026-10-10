import Papa from "papaparse";
import { isGoogleMapsUrl } from "./google-url";
export const MAX_BULK_INPUTS = 5000;
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export type ImportResult = { text: string; rows: number; duplicates: number };
function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}
export function importBusinessRows(rows: unknown[][]): ImportResult {
  if (rows.length < 2) throw new Error("Import requires a header and at least one business row.");
  const headers = rows[0]!.map((value) => normalizeHeader(String(value ?? "")));
  const column = (names: string[]) => headers.findIndex((header) => names.includes(header));
  const name = column(["business name", "business", "name"]),
    city = column(["city"]);
  const url = column(["google maps url", "maps url", "google maps link", "url"]);
  if (url < 0 && (name < 0 || city < 0))
    throw new Error("Required columns: Google Maps URL, or Business Name and City.");
  const values: string[] = [],
    errors: string[] = [];
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index]!;
    if (row.every((value) => value == null || String(value).trim() === "")) continue;
    if (values.length + errors.length >= MAX_BULK_INPUTS)
      throw new Error(`Maximum ${MAX_BULK_INPUTS} non-empty rows per import.`);
    const read = (col: number) => (col < 0 ? "" : String(row[col] ?? "").trim());
    const maps = read(url),
      business = read(name),
      location = read(city);
    const input = maps || `${business} ${location}`.trim();
    if (maps && !isGoogleMapsUrl(maps))
      errors.push(`Row ${index + 1}: unsupported Google Maps URL.`);
    else if (!maps && (!business || !location))
      errors.push(`Row ${index + 1}: business name and city required when URL is empty.`);
    else if (input.length > 2000 || /[\r\n]/.test(input) || /^[=+@]/.test(input))
      errors.push(`Row ${index + 1}: invalid input or formula; plain values required.`);
    else values.push(input);
  }
  if (errors.length)
    throw new Error(
      `Import rejected; no rows queued. ${errors.slice(0, 10).join(" ")}${errors.length > 10 ? ` (${errors.length} errors total)` : ""}`,
    );
  if (!values.length) throw new Error("No business rows found.");
  return {
    text: values.join("\n"),
    rows: values.length,
    duplicates:
      values.length - new Set(values.map((v) => (/^https:/.test(v) ? v : v.toLowerCase()))).size,
  };
}
export function parseBusinessCsv(text: string) {
  if (text.length > MAX_IMPORT_BYTES) throw new Error("CSV exceeds the 10 MB limit.");
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  if (parsed.errors.length) throw new Error(`CSV parse failed: ${parsed.errors[0]!.message}`);
  return importBusinessRows(parsed.data);
}
export async function extractBusinessSpreadsheet(file: File): Promise<ImportResult> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error("Import exceeds the 10 MB limit.");
  if (/\.csv$/i.test(file.name)) return parseBusinessCsv(await file.text());
  if (!/\.xlsx$/i.test(file.name))
    throw new Error("Upload CSV or .xlsx Excel; legacy .xls is not supported.");
  const data = await file.arrayBuffer();
  if (new Uint8Array(data)[0] !== 0x50 || new Uint8Array(data)[1] !== 0x4b)
    throw new Error("Not a valid XLSX file.");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheets = workbook.worksheets.filter((sheet) => sheet.rowCount > 0);
  if (sheets.length !== 1)
    throw new Error("Excel import requires exactly one non-empty worksheet.");
  const sheet = sheets[0]!;
  if (sheet.rowCount > MAX_BULK_INPUTS + 1 || sheet.columnCount > 50)
    throw new Error(`Excel maximum: ${MAX_BULK_INPUTS} rows and 50 columns.`);
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values: unknown[] = [];
    for (let index = 1; index <= sheet.columnCount; index++) {
      const value = row.getCell(index).value;
      if (value && typeof value === "object") {
        if ("formula" in value || "sharedFormula" in value)
          throw new Error(`Row ${row.number}: formulas are not accepted; paste values.`);
        if ("hyperlink" in value) values.push(value.hyperlink);
        else if ("richText" in value) values.push(value.richText.map((item) => item.text).join(""));
        else throw new Error(`Row ${row.number}: unsupported cell value; plain text required.`);
      } else values.push(value);
    }
    rows.push(values);
  });
  return importBusinessRows(rows);
}
