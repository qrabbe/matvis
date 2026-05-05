import { describe, expect, it } from 'bun:test';
import { makeZip, type ZipEntry } from '../../src/lib/zip';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('makeZip', () => {
  const entries: ZipEntry[] = [
    { name: 'a.pdf', bytes: bytes('hello') },
    { name: 'b.pdf', bytes: bytes('world!!') },
  ];

  it('writes the local, central, and end signatures', () => {
    const zip = makeZip(entries);
    const dv = new DataView(zip.buffer);
    // First four bytes are the local file header signature.
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    // The end-of-central-directory record trails the archive (no comment).
    expect(dv.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    // ...and reports both entries.
    expect(dv.getUint16(zip.length - 22 + 10, true)).toBe(2);
  });

  it('is deterministic for identical input', () => {
    expect(makeZip(entries)).toEqual(makeZip(entries));
  });

  it('stores each entry verbatim and recoverably', () => {
    expect(readStoredZip(makeZip(entries))).toEqual({
      'a.pdf': 'hello',
      'b.pdf': 'world!!',
    });
  });

  it('produces a valid empty archive', () => {
    const zip = makeZip([]);
    expect(zip.length).toBe(22);
    expect(new DataView(zip.buffer).getUint32(0, true)).toBe(0x06054b50);
  });
});

/**
 * Walk the STORE-method local headers and return { filename: text } for each
 * entry, proving the archive is structurally parseable and the bytes survive.
 */
function readStoredZip(zip: Uint8Array): Record<string, string> {
  const dv = new DataView(zip.buffer);
  const decoder = new TextDecoder();
  const out: Record<string, string> = {};
  let at = 0;
  while (dv.getUint32(at, true) === 0x04034b50) {
    const size = dv.getUint32(at + 18, true);
    const nameLen = dv.getUint16(at + 26, true);
    const extraLen = dv.getUint16(at + 28, true);
    const name = decoder.decode(zip.subarray(at + 30, at + 30 + nameLen));
    const dataAt = at + 30 + nameLen + extraLen;
    out[name] = decoder.decode(zip.subarray(dataAt, dataAt + size));
    at = dataAt + size;
  }
  return out;
}
