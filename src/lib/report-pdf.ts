export async function generateReportPdf(element: HTMLElement) {
  const [{ toSvg }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  await document.fonts.ready;
  const widthPixels = element.scrollWidth;
  const heightPixels = element.scrollHeight;
  if (!widthPixels || !heightPixels) throw new Error("Report capture is empty.");
  const svg = await toSvg(element, {
    width: widthPixels,
    height: heightPixels,
    cacheBust: false,
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(
      () => reject(new Error("PDF image rendering timed out. Retry export.")),
      30000,
    );
    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Could not render the report image."));
    };
    image.src = svg;
  });
  const canvas = document.createElement("canvas");
  canvas.width = widthPixels * 2;
  canvas.height = heightPixels * 2;
  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) throw new Error("PDF export requires browser canvas support.");
  canvasContext.fillStyle = "#ffffff";
  canvasContext.fillRect(0, 0, canvas.width, canvas.height);
  canvasContext.drawImage(image, 0, 0, canvas.width, canvas.height);
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
  return pdf;
}

export async function downloadReportPdf(element: HTMLElement, filename: string) {
  const pdf = await generateReportPdf(element);
  await pdf.save(filename, { returnPromise: true });
}
