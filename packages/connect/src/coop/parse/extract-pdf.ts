import { extractText, getDocumentProxy } from 'unpdf';

/**
 * Extract a receipt PDF's text as newline-separated lines.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text.join('\n') : text;
}
