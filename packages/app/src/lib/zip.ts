/**
 * Bundle files into a single ZIP for download.
 */
import { zipSync } from 'fflate';

/** One file to place in the archive. */
export interface ZipEntry {
  /** Path/name inside the archive. */
  name: string;
  /** File contents, stored uncompressed. */
  bytes: Uint8Array;
}

/**
 * Fixed modification time (the 1980 ZIP epoch) so identical input always yields
 * identical bytes.
 */
const FIXED_MTIME = new Date('1980-01-01T00:00:00Z');

/** Build a STORE-method ZIP archive from `entries`. */
export function makeZip(entries: ZipEntry[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const entry of entries) files[entry.name] = entry.bytes;
  // level: 0 selects the STORE method (no compression).
  return zipSync(files, { level: 0, mtime: FIXED_MTIME });
}
