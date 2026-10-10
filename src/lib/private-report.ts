export function savePrivatePdf(result: { base64: string; filename: string }) {
  const bytes = Uint8Array.from(atob(result.base64), (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
