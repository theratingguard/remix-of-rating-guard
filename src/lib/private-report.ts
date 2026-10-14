export function openPdfPreview(blob: Blob, preview: Window | null) {
  if (!preview) {
    throw new Error("Allow pop-ups to preview this PDF. No file was downloaded.");
  }
  const url = URL.createObjectURL(blob);
  preview.opener = null;
  preview.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
}

export function openPrivatePdf(
  result: { base64: string; filename: string },
  preview: Window | null,
) {
  const bytes = Uint8Array.from(atob(result.base64), (character) => character.charCodeAt(0));
  openPdfPreview(new Blob([bytes], { type: "application/pdf" }), preview);
}
