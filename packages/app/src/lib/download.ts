/** Browser file-download helpers. */

/** Trigger a browser download of a Blob under `filename`. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download raw bytes as a file (defaults to PDF). */
export function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  type = 'application/pdf',
): void {
  downloadBlob(new Blob([bytes as unknown as BlobPart], { type }), filename);
}

/** Download raw bytes as a ZIP archive. */
export function downloadZip(bytes: Uint8Array, filename: string): void {
  downloadBytes(bytes, filename, 'application/zip');
}

/** Download any JSON-serializable value as a pretty-printed `.json` file. */
export function downloadJson(value: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json',
  });
  downloadBlob(blob, filename);
}
