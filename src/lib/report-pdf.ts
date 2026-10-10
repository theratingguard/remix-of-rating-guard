export async function downloadReportPdf(element: HTMLElement, filename: string) {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  await document.fonts.ready;
  const canvas = await toCanvas(element, {
    backgroundColor: "#ffffff",
    pixelRatio: 2,
    cacheBust: false,
  });
  if (!canvas.width || !canvas.height) throw new Error("Report capture is empty.");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 10;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const height = pdf.internal.pageSize.getHeight() - margin * 2;
  const pagePixels = Math.max(1, Math.floor((height / width) * canvas.width));
  for (let top = 0; top < canvas.height; top += pagePixels) {
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = Math.min(pagePixels, canvas.height - top);
    const context = slice.getContext("2d");
    if (!context) throw new Error("PDF export requires browser canvas support.");
    context.drawImage(canvas, 0, top, canvas.width, slice.height, 0, 0, slice.width, slice.height);
    if (top > 0) pdf.addPage();
    pdf.addImage(
      slice.toDataURL("image/png"),
      "PNG",
      margin,
      margin,
      width,
      (slice.height / slice.width) * width,
    );
  }
  await pdf.save(filename, { returnPromise: true });
}
