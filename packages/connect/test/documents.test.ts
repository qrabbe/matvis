import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'bun:test';
import { parseCoopReceiptPdf } from '../src/coop/parse/receipt';

// Smoke test over real receipt PDFs kept locally in ./documents (git-ignored, 
// see documents/README.md). Every PDF present must parse
// end-to-end without throwing.
const documentsDir = fileURLToPath(new URL('./documents/', import.meta.url));

const pdfs = readdirSync(documentsDir)
  .filter((name) => name.toLowerCase().endsWith('.pdf'))
  .sort();

describe('local receipt documents parse', () => {
  if (pdfs.length === 0) {
    it.skip('no local PDFs in test/documents (drop some in to the folder)', () => {});
    return;
  }

  it.each(pdfs)('parses %s without throwing', async (name) => {
    const bytes = new Uint8Array(await readFile(documentsDir + name));
    const receipt = await parseCoopReceiptPdf(bytes);
    expect(receipt).toBeDefined();
  });
});
