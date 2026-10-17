/**
 * Descarga un Blob con un `<a download>` programático.
 * Se re-tipa como `application/octet-stream`: así el navegador nunca lo interpreta (p. ej. un SVG
 * con scripts abierto en otra pestaña), solo lo guarda.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(new Blob([blob], { type: "application/octet-stream" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
