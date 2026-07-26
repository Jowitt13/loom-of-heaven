import { deflateRawSync, inflateRawSync } from 'node:zlib';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

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

// --- ZIP extraction safety quotas ---

/** Configurable quotas for safe ZIP extraction. */
export interface ZipQuota {
  /** Max compressed ZIP file size in bytes. */
  maxZipFileBytes: number;
  /** Max number of entries in the archive. */
  maxEntries: number;
  /** Max uncompressed size of a single file entry in bytes. */
  maxSingleFileBytes: number;
  /** Max total uncompressed size across all entries in bytes. */
  maxTotalUncompressedBytes: number;
  /** Max allowed ratio of uncompressed/compressed per entry (compSize > 0). */
  maxCompressionRatio: number;
  /** Allowed compression method numbers (0 = stored, 8 = deflate). */
  allowedMethods: ReadonlySet<number>;
}

/** Default quotas derived from v0.1.7 candidate package measurements + growth margin. */
export const DEFAULT_ZIP_QUOTA: ZipQuota = {
  maxZipFileBytes: 2_000_000,
  maxEntries: 100,
  maxSingleFileBytes: 8_000_000,
  maxTotalUncompressedBytes: 12_000_000,
  maxCompressionRatio: 20,
  allowedMethods: new Set([0, 8]),
};

/**
 * Safely extract a ZIP archive to `destDir` with full quota enforcement.
 *
 * Security properties:
 * - Metadata pre-check (inflate-before): file size, entry count, declared sizes,
 *   ratio, method whitelist, path safety, format consistency (EOCD/CD/local).
 * - Inflate uses `maxOutputLength` capped at declared uncompSize so a forged small
 *   declaration cannot cause unbounded memory allocation.
 * - destDir must NOT exist before extraction (rejects symlinks, junctions, existing
 *   dirs). Staging directory is created as a sibling of destDir (same filesystem)
 *   and promoted via a single `renameSync` — no per-file commit, no partial state.
 * - Any failure (precheck, inflate, CRC) removes the staging dir; destDir is never
 *   created in the failure path.
 *
 * NOTE: This secures the repository toolchain's ZIP extraction. It does NOT
 * automatically protect desktop-host Agent install flows (those use their own
 * download/extract path outside this codebase).
 *
 * Returns the list of written archive-relative names on success.
 * Throws on any violation (quota, structure, integrity).
 */
export function extractZipSafe(
  zip: Buffer,
  destDir: string,
  quotaOverrides?: Partial<ZipQuota>,
): string[] {
  const q: ZipQuota = { ...DEFAULT_ZIP_QUOTA, ...quotaOverrides };

  // --- Destination safety: must not exist (rejects ANY object incl. dangling symlink) ---
  try {
    lstatSync(destDir);
    throw new Error('ZIP: destination already exists (must be a fresh path)');
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }

  // 1. ZIP file size
  if (zip.length > q.maxZipFileBytes) {
    throw new Error(`ZIP exceeds maxZipFileBytes (${zip.length} > ${q.maxZipFileBytes})`);
  }

  // Locate EOCD
  let eocdPos = -1;
  for (let i = zip.length - 22; i >= 0; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) throw new Error('ZIP: EOCD not found');

  // --- P1: EOCD consistency ---
  const eocdDisk = zip.readUInt16LE(eocdPos + 4);
  const eocdCdDisk = zip.readUInt16LE(eocdPos + 6);
  const eocdEntriesOnDisk = zip.readUInt16LE(eocdPos + 8);
  const count = zip.readUInt16LE(eocdPos + 10);
  const cdSize = zip.readUInt32LE(eocdPos + 12);
  const cdOffset = zip.readUInt32LE(eocdPos + 16);
  const eocdCommentLen = zip.readUInt16LE(eocdPos + 20);

  // Reject multi-disk and ZIP64 sentinels
  if (eocdDisk !== 0 || eocdCdDisk !== 0) throw new Error('ZIP: multi-disk not supported');
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error('ZIP: ZIP64 not supported');
  }
  if (eocdEntriesOnDisk !== count) throw new Error('ZIP: EOCD entry count mismatch');
  // EOCD comment length must be consistent with file length
  if (eocdPos + 22 + eocdCommentLen !== zip.length) {
    throw new Error('ZIP: EOCD comment length inconsistent with file size');
  }
  // CD must fit exactly before EOCD (no gap or overlap in our supported ZIP subset)
  if (cdOffset + cdSize !== eocdPos) {
    throw new Error('ZIP: central directory does not end exactly at EOCD (gap or overlap)');
  }

  // 2. Entry count
  if (count > q.maxEntries) {
    throw new Error(`ZIP exceeds maxEntries (${count} > ${q.maxEntries})`);
  }

  // --- Metadata pre-check (no inflate yet) ---
  interface PreEntry {
    name: string;
    method: number;
    crc: number;
    compSize: number;
    uncompSize: number;
    localOffset: number;
  }
  const entries: PreEntry[] = [];
  const seenPaths = new Set<string>();
  let totalUncomp = 0;
  let p = cdOffset;

  for (let n = 0; n < count; n++) {
    if (p + 46 > zip.length) throw new Error('ZIP: central directory truncated');
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP: bad CD signature');

    const cdFlags = zip.readUInt16LE(p + 8);
    const method = zip.readUInt16LE(p + 10);
    const crc = zip.readUInt32LE(p + 16);
    const compSize = zip.readUInt32LE(p + 20);
    const uncompSize = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);

    // Bounds: CD entry itself
    if (p + 46 + nameLen + extraLen + commentLen > zip.length) {
      throw new Error('ZIP: CD entry extends beyond file');
    }

    // P1: Reject encryption
    if (cdFlags & 0x01) throw new Error('ZIP: encrypted entries not supported');
    if (cdFlags & 0x40) throw new Error('ZIP: strong encryption not supported');
    // P1: Reject data descriptor
    if (cdFlags & 0x08) throw new Error('ZIP: data descriptor not supported');

    const name = zip.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;

    // Skip directory entries (name ends with /)
    if (name.endsWith('/')) continue;

    // 8. Method whitelist
    if (!q.allowedMethods.has(method)) {
      throw new Error(`ZIP: unsupported method ${method}`);
    }

    // 9. Path safety
    if (name.length === 0) throw new Error('ZIP: empty entry name');
    if (name.includes('\0')) throw new Error('ZIP: NUL in entry name');
    if (name.startsWith('/')) throw new Error('ZIP: absolute path');
    if (name.includes('\\')) throw new Error('ZIP: backslash in path');
    if (/^[A-Za-z]:/.test(name)) throw new Error('ZIP: drive letter in path');
    const segments = name.split('/');
    if (segments.some((s) => s === '.' || s === '..')) {
      throw new Error('ZIP: dot/dotdot segment in path');
    }

    // Duplicate canonical path
    const canonical = segments.join('/');
    if (seenPaths.has(canonical)) {
      throw new Error(`ZIP: duplicate path "${canonical}"`);
    }
    seenPaths.add(canonical);

    // Directory/file conflict
    for (let i = 1; i < segments.length; i++) {
      const prefix = segments.slice(0, i).join('/');
      if (seenPaths.has(prefix)) {
        throw new Error(`ZIP: directory/file conflict at "${prefix}"`);
      }
    }

    // 10. Resolved path must stay inside destDir
    const resolved = resolve(destDir, ...segments);
    const destResolved = resolve(destDir);
    if (!resolved.startsWith(destResolved + sep) && resolved !== destResolved) {
      throw new Error('ZIP: path escapes destination directory');
    }

    // 3/4. Local header bounds and consistency
    if (localOffset + 30 > zip.length) {
      throw new Error('ZIP: local header offset out of bounds');
    }
    // P1: Local header signature
    if (zip.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error('ZIP: bad local header signature');
    }
    // P1: Local method must match CD
    const localMethod = zip.readUInt16LE(localOffset + 8);
    if (localMethod !== method) {
      throw new Error('ZIP: local method differs from central directory');
    }
    // P1: Local flags must match CD flags
    const localFlags = zip.readUInt16LE(localOffset + 6);
    if (localFlags !== cdFlags) {
      throw new Error('ZIP: local flags differ from central directory');
    }
    const lNameLen = zip.readUInt16LE(localOffset + 26);
    const lExtraLen = zip.readUInt16LE(localOffset + 28);
    // P1: Local name must match CD name
    const localName = zip.subarray(localOffset + 30, localOffset + 30 + lNameLen).toString('utf8');
    if (localName !== name) {
      throw new Error('ZIP: local entry name differs from central directory');
    }
    // P1: Local CRC/sizes must equal CD (no data descriptor in our supported subset)
    const localCrc = zip.readUInt32LE(localOffset + 14);
    const localCompSize = zip.readUInt32LE(localOffset + 18);
    const localUncompSize = zip.readUInt32LE(localOffset + 22);
    if (localCrc !== crc || localCompSize !== compSize || localUncompSize !== uncompSize) {
      throw new Error('ZIP: local header sizes/CRC differ from central directory');
    }
    // stored: compSize must equal uncompSize
    if (method === 0 && compSize !== uncompSize) {
      throw new Error('ZIP: stored entry compSize !== uncompSize');
    }
    // compSize=0 but uncompSize!=0 is invalid
    if (compSize === 0 && uncompSize !== 0) {
      throw new Error('ZIP: compSize is 0 but uncompSize is not');
    }
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    if (dataStart + compSize > zip.length) {
      throw new Error('ZIP: compressed data extends beyond file');
    }
    // P1: Local data range must be before central directory
    if (dataStart + compSize > cdOffset) {
      throw new Error('ZIP: local data overlaps central directory');
    }

    // 5. Single file size
    if (uncompSize > q.maxSingleFileBytes) {
      throw new Error(
        `ZIP: entry uncompSize ${uncompSize} > maxSingleFileBytes ${q.maxSingleFileBytes}`,
      );
    }

    // 6. Running total
    totalUncomp += uncompSize;
    if (totalUncomp > q.maxTotalUncompressedBytes) {
      throw new Error(
        `ZIP: total uncompressed ${totalUncomp} > maxTotalUncompressedBytes ${q.maxTotalUncompressedBytes}`,
      );
    }

    // 7. Compression ratio
    if (compSize > 0 && uncompSize / compSize > q.maxCompressionRatio) {
      throw new Error(
        `ZIP: compression ratio ${(uncompSize / compSize).toFixed(1)} > maxCompressionRatio ${q.maxCompressionRatio}`,
      );
    }

    entries.push({ name: canonical, method, crc, compSize, uncompSize, localOffset });
  }

  // CD must be exactly exhausted (no trailing garbage before EOCD)
  if (p !== cdOffset + cdSize) {
    throw new Error('ZIP: central directory size mismatch');
  }

  // --- All pre-checks passed; inflate into a staging sibling directory ---
  // Staging is in the same parent as destDir (same filesystem → rename is atomic).
  // destParent must already exist — we do NOT recursively create unknown parents.
  const destParent = dirname(resolve(destDir));
  if (!lstatSync(destParent).isDirectory()) {
    throw new Error('ZIP: destination parent is not an existing directory');
  }
  const staging = mkdtempSync(join(destParent, '.zip-staging-'));

  try {
    const written: string[] = [];
    for (const e of entries) {
      const lNameLen = zip.readUInt16LE(e.localOffset + 26);
      const lExtraLen = zip.readUInt16LE(e.localOffset + 28);
      const dataStart = e.localOffset + 30 + lNameLen + lExtraLen;
      const compData = zip.subarray(dataStart, dataStart + e.compSize);

      // P0-1: inflate with maxOutputLength capped at declared size
      const maxOut = e.uncompSize || 1; // zlib rejects 0
      const data =
        e.method === 8
          ? inflateRawSync(compData, { maxOutputLength: maxOut })
          : Buffer.from(compData);

      // Post-inflate integrity
      if (data.length !== e.uncompSize) {
        throw new Error(
          `ZIP: inflated size mismatch for "${e.name}" (${data.length} != ${e.uncompSize})`,
        );
      }
      if (crc32(data) !== e.crc) {
        throw new Error(`ZIP: CRC mismatch for "${e.name}"`);
      }

      const outPath = join(staging, ...e.name.split('/'));
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, data);
      written.push(e.name);
    }

    // P0-3: Single directory-level rename (atomic on same filesystem)
    renameSync(staging, resolve(destDir));
    return written;
  } catch (err) {
    // Clean up staging on any failure — destDir is never created
    rmSync(staging, { recursive: true, force: true });
    throw err;
  }
}

/**
 * Extract a ZIP into `destDir` with full safety quotas (DEFAULT_ZIP_QUOTA).
 * destDir must not exist; see extractZipSafe for security properties.
 *
 * NOTE: This Buffer entry cannot undo memory already allocated by the caller.
 * For disk-based ZIPs, prefer extractZipFileSafe which stat-checks BEFORE reading.
 */
export function extractZip(zip: Buffer, destDir: string): string[] {
  return extractZipSafe(zip, destDir);
}

/**
 * Safely read a ZIP file from disk: lstat confirms regular file and size <=
 * maxZipFileBytes BEFORE reading. Returns the Buffer.
 * All disk-based ZIP reads in the toolchain must use this entry.
 */
export function readZipFileSafe(zipPath: string, quotaOverrides?: Partial<ZipQuota>): Buffer {
  const q: ZipQuota = { ...DEFAULT_ZIP_QUOTA, ...quotaOverrides };
  const st = lstatSync(zipPath);
  if (!st.isFile()) {
    throw new Error('ZIP: path is not a regular file');
  }
  if (st.size > q.maxZipFileBytes) {
    throw new Error(`ZIP file exceeds maxZipFileBytes (${st.size} > ${q.maxZipFileBytes})`);
  }
  return readFileSync(zipPath);
}

/**
 * Extract a ZIP FILE to destDir, enforcing maxZipFileBytes BEFORE reading the file.
 * This is the recommended entry for disk-based ZIPs (tools, verifiers).
 *
 * The Buffer entry (extractZipSafe) remains for unit tests and trusted in-memory
 * build products, but it cannot undo an already-allocated Buffer.
 */
export function extractZipFileSafe(
  zipPath: string,
  destDir: string,
  quotaOverrides?: Partial<ZipQuota>,
): string[] {
  const zip = readZipFileSafe(zipPath, quotaOverrides);
  return extractZipSafe(zip, destDir, quotaOverrides);
}
