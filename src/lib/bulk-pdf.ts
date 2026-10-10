import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;
export async function extractBulkPdf(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error("PDF exceeds the 10 MB limit.");
  const data = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(data.subarray(0, 5)) !== "%PDF-")
    throw new Error("Not a valid PDF file.");
  const task = getDocument({ data });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 40) throw new Error("Maximum 40 pages per bulk PDF.");
    const lines: string[] = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      let line = "";
      let y: number | undefined;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const currentY = item.transform[5];
        if (y !== undefined && Math.abs(y - currentY) > 3 && line.trim()) {
          lines.push(line.trim());
          line = "";
        }
        line += `${line ? " " : ""}${item.str}`;
        y = currentY;
        if (item.hasEOL && line.trim()) {
          lines.push(line.trim());
          line = "";
          y = undefined;
        }
      }
      if (line.trim()) lines.push(line.trim());
    }
    if (!lines.length)
      throw new Error(
        "This PDF has no selectable text. Scanned/image-only PDFs are not supported; upload a text PDF or paste business names.",
      );
    if (lines.length > 500)
      throw new Error("PDF contains more than 500 lines. Use one business or URL per line.");
    return lines.join("\n");
  } finally {
    await task.destroy();
  }
}
