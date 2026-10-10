import { it, expect, vi, afterEach } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
vi.mock("pdfjs-dist", async () => await import("pdfjs-dist/legacy/build/pdf.mjs"));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: import.meta.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
}));
import { extractBulkPdf } from "./bulk-pdf";
afterEach(() => vi.restoreAllMocks());
it("extracts five selectable business names from a real PDF", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage();
  const names = [
    "The Hudson Albany",
    "Business Two City",
    "Business Three City",
    "Business Four City",
    "Business Five City",
  ];
  names.forEach((name, index) =>
    page.drawText(name, { font, size: 12, x: 40, y: 700 - index * 25 }),
  );
  const bytes = await pdf.save();
  const file = new File([new Uint8Array(bytes)], "businesses.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array(bytes).buffer });
  expect((await extractBulkPdf(file)).split("\n")).toEqual(names);
});
it("rejects invalid or oversized PDFs explicitly", async () => {
  const file = new File(["not pdf"], "invalid.pdf");
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new TextEncoder().encode("not pdf").buffer,
  });
  await expect(extractBulkPdf(file)).rejects.toThrow("Not a valid PDF");
  const large = new File([], "large.pdf");
  Object.defineProperty(large, "size", { value: 11 * 1024 * 1024 });
  await expect(extractBulkPdf(large)).rejects.toThrow("10 MB");
});
