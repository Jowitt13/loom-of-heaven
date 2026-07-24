import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

/**
 * Dependency-free, byte-reproducible ZIP writer/reader shared by the packaging
 * tools (`package-skill.ts`, `build-host-packages.ts`). Built in-process
 * (CRC32 + DEFLATE) and re-parsed to verify every entry round-trips, so a green
 * run proves the archive is well-formed and complete with no external tool.
 */

// Fixed DOS timestamp (2020-01-01 00:00:00) so archives are byte-reproducible.
const DOS_TIME = 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface FileEntry {
  /** Archive-relative path using forward slashes. */
  name: string;
  data: Buffer;
}

interface CentralEntry {
  nameBuf: Buffer;
  crc: number;
  compSize: number;
  uncompSize: number;
  offset: number;
}

/** Recursively collect every file under dir as archive entries (posix names). */
export function collectFiles(dir: string, base: string): FileEntry[] {
  const out: FileEntry[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(abs, base));
    } else if (entry.isFile()) {
      const rel = relative(base, abs).split(sep).join('/');
      out.push({ name: rel, data: readFileSync(abs) });
    }
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Filename extensions treated as text for deterministic LF normalization. */
const TEXT_EXTENSIONS = new Set([
  '.md',
  '.json',
  '.jsonc',
  '.yaml',
  '.yml',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.html',
  '.htm',
  '.css',
  '.txt',
]);
/** Extension-less text files that must also be normalized. */
const TEXT_FILENAMES = new Set(['LICENSE', 'THIRD_PARTY_NOTICES', 'NOTICE', 'AUTHORS']);

/** True iff an archive entry name is a text file eligible for LF normalization. */
export function isTextEntry(name: string): boolean {
  const base = (name.split('/').pop() ?? name).trim();
  if (TEXT_FILENAMES.has(base)) return true;
  const dot = base.lastIndexOf('.');
  return dot > 0 && TEXT_EXTENSIONS.has(base.slice(dot).toLowerCase());
}

/**
 * Deterministic LF normalization for text entries so the archive is byte-identical
 * regardless of the working-tree line endings (a Windows CRLF checkout must yield the SAME
 * zip bytes as a LF checkout). Binary files (e.g. *.png) and anything containing a NUL byte
 * are returned untouched. CRLF and lone CR are both collapsed to LF.
 */
export function normalizeZipEntryData(name: string, data: Buffer): Buffer {
  if (!isTextEntry(name) || data.includes(0)) return data;
  let changed = false;
  const out: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const b = data[i]!;
    if (b === 0x0d) {
      // CR: emit LF, and swallow a following LF (CRLF -> single LF).
      out.push(0x0a);
      changed = true;
      if (data[i + 1] === 0x0a) i++;
    } else {
      out.push(b);
    }
  }
  return changed ? Buffer.from(out) : data;
}

/** Build a ZIP (DEFLATE) from entries; returns the archive bytes. */
export function buildZip(files: FileEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const central: CentralEntry[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const crc = crc32(f.data);
    const comp = deflateRawSync(f.data, { level: 9 });

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // general flags: bit 11 = UTF-8 names
    local.writeUInt16LE(8, 8); // compression method: deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    const localHeader = Buffer.concat([local, nameBuf]);

    central.push({ nameBuf, crc, compSize: comp.length, uncompSize: f.data.length, offset });
    chunks.push(localHeader, comp);
    offset += localHeader.length + comp.length;
  }

  const cdStart = offset;
  const cdParts: Buffer[] = [];
  for (const e of central) {
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // central directory header signature
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0x0800, 8); // flags: UTF-8 names
    cd.writeUInt16LE(8, 10); // method
    cd.writeUInt16LE(DOS_TIME, 12);
    cd.writeUInt16LE(DOS_DATE, 14);
    cd.writeUInt32LE(e.crc, 16);
    cd.writeUInt32LE(e.compSize, 20);
    cd.writeUInt32LE(e.uncompSize, 24);
    cd.writeUInt16LE(e.nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra
    cd.writeUInt16LE(0, 32); // comment
    cd.writeUInt16LE(0, 34); // disk number start
    cd.writeUInt16LE(0, 36); // internal attrs
    cd.writeUInt32LE(0, 38); // external attrs
    cd.writeUInt32LE(e.offset, 42); // local header offset
    cdParts.push(Buffer.concat([cd, e.nameBuf]));
  }
  const cdBuf = Buffer.concat(cdParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with CD
  eocd.writeUInt16LE(central.length, 8); // entries on this disk
  eocd.writeUInt16LE(central.length, 10); // total entries
  eocd.writeUInt32LE(cdBuf.length, 12); // CD size
  eocd.writeUInt32LE(cdStart, 16); // CD offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...chunks, cdBuf, eocd]);
}

/** Re-parse the archive and fully decompress every entry; true iff it round-trips. */
export function verifyZip(zip: Buffer, expected: FileEntry[]): boolean {
  let eocdPos = -1;
  for (let i = zip.length - 22; i >= 0; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) return false;
  const count = zip.readUInt16LE(eocdPos + 10);
  const cdOffset = zip.readUInt32LE(eocdPos + 16);
  if (count !== expected.length) return false;

  const byName = new Map(expected.map((e) => [e.name, e.data]));
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) return false;
    const method = zip.readUInt16LE(p + 10);
    const crc = zip.readUInt32LE(p + 16);
    const compSize = zip.readUInt32LE(p + 20);
    const uncompSize = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString('utf8');

    const lNameLen = zip.readUInt16LE(localOffset + 26);
    const lExtraLen = zip.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const compData = zip.subarray(dataStart, dataStart + compSize);
    const inflated = method === 8 ? inflateRawSync(compData) : Buffer.from(compData);

    const original = byName.get(name);
    if (inflated.length !== uncompSize) return false;
    if (crc32(inflated) !== crc) return false;
    if (!original || !original.equals(inflated)) return false;

    p += 46 + nameLen + extraLen + commentLen;
  }
  return true;
}

/** List entry names in a ZIP archive (for structure assertions). */
export function listZipEntries(zip: Buffer): string[] {
  let eocdPos = -1;
  for (let i = zip.length - 22; i >= 0; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) return [];
  const count = zip.readUInt16LE(eocdPos + 10);
  const cdOffset = zip.readUInt32LE(eocdPos + 16);
  const names: string[] = [];
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) break;
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    names.push(zip.subarray(p + 46, p + 46 + nameLen).toString('utf8'));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

/**
 * Structure assertion for a host package ZIP: exactly ONE top-level directory equal to
 * `packageName`, `packageName/SKILL.md` present, and NO double-nested `packageName/packageName/`.
 * Pure function (no I/O) so it can be unit-tested with positive and negative fixtures.
 */
export function assertSingleTopDir(
  entries: string[],
  packageName: string,
): { ok: boolean; error?: string } {
  if (entries.length === 0) return { ok: false, error: 'empty archive' };
  const topDirs = new Set(entries.map((e) => e.split('/')[0]));
  if (topDirs.size !== 1) {
    return { ok: false, error: `expected 1 top-level dir, got ${[...topDirs].join(', ')}` };
  }
  const top = [...topDirs][0]!;
  if (top !== packageName) {
    return { ok: false, error: `top-level dir is "${top}", expected "${packageName}"` };
  }
  const doubled = `${packageName}/${packageName}/`;
  const nested = entries.find((e) => e.startsWith(doubled));
  if (nested) {
    return { ok: false, error: `double-nested entry: ${nested}` };
  }
  if (!entries.includes(`${packageName}/SKILL.md`)) {
    return { ok: false, error: `missing ${packageName}/SKILL.md at top level` };
  }
  return { ok: true };
}

/**
 * Extract every file entry of a ZIP into `destDir` (dependency-free, uses the central
 * directory + raw inflate). Directory entries (names ending in `/`) are skipped; parent
 * dirs are created as needed. Returns the list of written archive-relative names.
 */
export function extractZip(zip: Buffer, destDir: string): string[] {
  let eocdPos = -1;
  for (let i = zip.length - 22; i >= 0; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) throw new Error('extractZip: EOCD not found');
  const count = zip.readUInt16LE(eocdPos + 10);
  const cdOffset = zip.readUInt32LE(eocdPos + 16);
  const written: string[] = [];
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) break;
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue; // directory entry
    const lNameLen = zip.readUInt16LE(localOffset + 26);
    const lExtraLen = zip.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const compData = zip.subarray(dataStart, dataStart + compSize);
    const data = method === 8 ? inflateRawSync(compData) : Buffer.from(compData);
    // Guard against path traversal in archive names.
    const safe = name.split('/').filter((s) => s !== '..' && s !== '');
    const outPath = join(destDir, ...safe);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, data);
    written.push(name);
  }
  return written;
}
