import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  assertSingleTopDir,
  buildZip,
  DEFAULT_ZIP_QUOTA,
  extractZip,
  extractZipFileSafe,
  extractZipSafe,
  listZipEntries,
  readZipFileSafe,
} from './zip.ts';

const PKG = 'calculate-birth-charts';

describe('assertSingleTopDir', () => {
  it('accepts a single top-level dir equal to packageName with SKILL.md', () => {
    const good = [
      `${PKG}/SKILL.md`,
      `${PKG}/scripts/ming-chart.mjs`,
      `${PKG}/scripts/dist/engine.mjs`,
    ];
    expect(assertSingleTopDir(good, PKG).ok).toBe(true);
  });

  it('rejects the double-nested packageName/packageName/ layout (the Round 11 bug)', () => {
    const doubled = [`${PKG}/${PKG}/SKILL.md`, `${PKG}/${PKG}/scripts/ming-chart.mjs`];
    const res = assertSingleTopDir(doubled, PKG);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/double-nested/);
  });

  it('rejects more than one top-level directory', () => {
    const res = assertSingleTopDir([`${PKG}/SKILL.md`, `other/README.md`], PKG);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/1 top-level dir/);
  });

  it('rejects a wrong top-level directory name', () => {
    const res = assertSingleTopDir(['wrong-name/SKILL.md'], PKG);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/top-level dir/);
  });

  it('rejects a package missing top-level SKILL.md', () => {
    const res = assertSingleTopDir([`${PKG}/scripts/ming-chart.mjs`], PKG);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/SKILL\.md/);
  });

  it('rejects an empty archive', () => {
    expect(assertSingleTopDir([], PKG).ok).toBe(false);
  });
});

describe('buildZip / listZipEntries / extractZip round-trip', () => {
  const files = [
    { name: `${PKG}/SKILL.md`, data: Buffer.from('# skill\n', 'utf8') },
    { name: `${PKG}/scripts/ming-chart.mjs`, data: Buffer.from('export const x = 1;\n', 'utf8') },
  ];

  it('lists exactly the written entries and passes the single-top-dir assertion', () => {
    const zip = buildZip(files);
    const entries = listZipEntries(zip);
    expect(entries.sort()).toEqual(files.map((f) => f.name).sort());
    expect(assertSingleTopDir(entries, PKG).ok).toBe(true);
  });

  it('extracts byte-identical file contents to disk', () => {
    const zip = buildZip(files);
    const dir = mkdtempSync(join(tmpdir(), 'ming-zip-test-'));
    const out = join(dir, 'out');
    try {
      const written = extractZip(zip, out);
      expect(written.sort()).toEqual(files.map((f) => f.name).sort());
      for (const f of files) {
        expect(readFileSync(join(out, ...f.name.split('/')))).toEqual(f.data);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a synthesized double-nested archive via listZipEntries', () => {
    const badZip = buildZip([{ name: `${PKG}/${PKG}/SKILL.md`, data: Buffer.from('x') }]);
    expect(assertSingleTopDir(listZipEntries(badZip), PKG).ok).toBe(false);
  });
});

// --- ZIP extraction safety quota tests (synthetic buffers, temp dirs only) ---

/** Helper: build a minimal valid ZIP with the given entries and extract safely. */
function safeExtract(
  entries: Array<{ name: string; data: Buffer }>,
  quota?: Partial<typeof DEFAULT_ZIP_QUOTA>,
): string[] {
  const zip = buildZip(entries);
  const dir = mkdtempSync(join(tmpdir(), 'zip-safe-'));
  const out = join(dir, 'out');
  try {
    return extractZipSafe(zip, out, quota);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('extractZipSafe quota enforcement', () => {
  const good = [{ name: 'pkg/hello.txt', data: Buffer.from('hello') }];

  it('1. normal ZIP extracts successfully', () => {
    const zip = buildZip(good);
    const dir = mkdtempSync(join(tmpdir(), 'zip-ok-'));
    const out = join(dir, 'out');
    try {
      const written = extractZipSafe(zip, out);
      expect(written).toContain('pkg/hello.txt');
      expect(readFileSync(join(out, 'pkg', 'hello.txt'), 'utf8')).toBe('hello');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('2. rejects ZIP exceeding maxZipFileBytes', () => {
    expect(() => safeExtract(good, { maxZipFileBytes: 10 })).toThrow(/maxZipFileBytes/);
  });

  it('3. rejects ZIP exceeding maxEntries', () => {
    expect(() => safeExtract(good, { maxEntries: 0 })).toThrow(/maxEntries/);
  });

  it('4. rejects single file exceeding maxSingleFileBytes (metadata precheck)', () => {
    const big = Buffer.alloc(1000, 0x41);
    expect(() =>
      safeExtract([{ name: 'pkg/big.txt', data: big }], { maxSingleFileBytes: 500 }),
    ).toThrow(/maxSingleFileBytes/);
  });

  it('5. rejects total uncompressed exceeding maxTotalUncompressedBytes', () => {
    // Use random-ish data so compression ratio stays low
    const a = Buffer.from('x'.repeat(100) + 'y'.repeat(100) + Math.random().toString(36));
    const b = Buffer.from('z'.repeat(100) + 'w'.repeat(100) + Math.random().toString(36));
    expect(() =>
      safeExtract(
        [
          { name: 'pkg/a.txt', data: a },
          { name: 'pkg/b.txt', data: b },
        ],
        { maxTotalUncompressedBytes: 100, maxCompressionRatio: 100 },
      ),
    ).toThrow(/maxTotalUncompressedBytes/);
  });

  it('6. rejects excessive compression ratio', () => {
    // Highly compressible: 10000 zeros
    const data = Buffer.alloc(10000, 0);
    expect(() =>
      safeExtract([{ name: 'pkg/zeros.bin', data }], { maxCompressionRatio: 2 }),
    ).toThrow(/maxCompressionRatio/);
  });

  it('7. rejects out-of-bounds local header offset', () => {
    const zip = buildZip(good);
    // Corrupt: set local offset in CD to beyond file
    let eocdPos = -1;
    for (let i = zip.length - 22; i >= 0; i--) {
      if (zip.readUInt32LE(i) === 0x06054b50) {
        eocdPos = i;
        break;
      }
    }
    const cdOff = zip.readUInt32LE(eocdPos! + 16);
    // Write a huge offset in the CD entry's local-header-offset field (byte 42)
    zip.writeUInt32LE(zip.length + 1000, cdOff + 42);
    const dir = mkdtempSync(join(tmpdir(), 'zip-oob-'));
    const out = join(dir, 'out');
    try {
      expect(() => extractZipSafe(zip, out)).toThrow(/out of bounds/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('8. rejects path traversal (../)', () => {
    expect(() => safeExtract([{ name: '../etc/passwd', data: Buffer.from('x') }])).toThrow(
      /dot.*dotdot/,
    );
  });

  it('9. rejects Windows drive letter path', () => {
    expect(() => safeExtract([{ name: 'C:/foo.txt', data: Buffer.from('x') }])).toThrow(
      /drive letter/,
    );
  });

  it('10. rejects backslash in path', () => {
    expect(() => safeExtract([{ name: 'foo\\bar.txt', data: Buffer.from('x') }])).toThrow(
      /backslash/,
    );
  });

  it('11. rejects duplicate paths', () => {
    expect(() =>
      safeExtract([
        { name: 'pkg/a.txt', data: Buffer.from('1') },
        { name: 'pkg/a.txt', data: Buffer.from('2') },
      ]),
    ).toThrow(/duplicate/);
  });

  it('12. rejects unsupported compression method', () => {
    const zip = buildZip(good);
    // Corrupt: change method in CD entry from 8 to 99
    let eocdPos = -1;
    for (let i = zip.length - 22; i >= 0; i--) {
      if (zip.readUInt32LE(i) === 0x06054b50) {
        eocdPos = i;
        break;
      }
    }
    const cdOff = zip.readUInt32LE(eocdPos! + 16);
    zip.writeUInt16LE(99, cdOff + 10); // method field at offset 10 in CD entry
    const dir = mkdtempSync(join(tmpdir(), 'zip-method-'));
    const out = join(dir, 'out');
    try {
      expect(() => extractZipSafe(zip, out)).toThrow(/unsupported method/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('13. rejects empty name, NUL, dot and dotdot segments', () => {
    expect(() => safeExtract([{ name: '', data: Buffer.from('x') }])).toThrow();
    expect(() => safeExtract([{ name: 'a/./b.txt', data: Buffer.from('x') }])).toThrow(
      /dot.*dotdot/,
    );
    expect(() => safeExtract([{ name: 'a/../b.txt', data: Buffer.from('x') }])).toThrow(
      /dot.*dotdot/,
    );
  });

  it('14. rejects CRC mismatch and leaves no files', () => {
    const zip = buildZip([{ name: 'pkg/file.txt', data: Buffer.from('correct') }]);
    // Corrupt CRC in central directory (offset 16 in CD entry)
    let eocdPos = -1;
    for (let i = zip.length - 22; i >= 0; i--) {
      if (zip.readUInt32LE(i) === 0x06054b50) {
        eocdPos = i;
        break;
      }
    }
    const cdOff = zip.readUInt32LE(eocdPos! + 16);
    zip.writeUInt32LE(0xdeadbeef, cdOff + 16); // corrupt CRC
    const dir = mkdtempSync(join(tmpdir(), 'zip-crc-'));
    const out = join(dir, 'out');
    try {
      expect(() => extractZipSafe(zip, out)).toThrow(/CRC/);
      // No residue in dest
      expect(existsSync(join(out, 'pkg', 'file.txt'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('15. failed extraction cleans up temp directory (no half-extracted files)', () => {
    // Two entries: first OK, second has bad CRC
    const entries = [
      { name: 'pkg/a.txt', data: Buffer.from('aaa') },
      { name: 'pkg/b.txt', data: Buffer.from('bbb') },
    ];
    const zip = buildZip(entries);
    // Corrupt CRC of second entry in CD
    let eocdPos = -1;
    for (let i = zip.length - 22; i >= 0; i--) {
      if (zip.readUInt32LE(i) === 0x06054b50) {
        eocdPos = i;
        break;
      }
    }
    const cdOff = zip.readUInt32LE(eocdPos! + 16);
    // Skip first CD entry to reach second
    const nameLen1 = zip.readUInt16LE(cdOff + 28);
    const extraLen1 = zip.readUInt16LE(cdOff + 30);
    const commentLen1 = zip.readUInt16LE(cdOff + 32);
    const secondCd = cdOff + 46 + nameLen1 + extraLen1 + commentLen1;
    zip.writeUInt32LE(0xbaadf00d, secondCd + 16); // corrupt second CRC
    const dir = mkdtempSync(join(tmpdir(), 'zip-cleanup-'));
    const out = join(dir, 'out');
    try {
      expect(() => extractZipSafe(zip, out)).toThrow(/CRC/);
      // Neither file should exist in destDir
      expect(existsSync(join(out, 'pkg', 'a.txt'))).toBe(false);
      expect(existsSync(join(out, 'pkg', 'b.txt'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// --- P0-1: forged uncompSize with real large deflate stream ---

describe('P0-1: inflate maxOutputLength prevents forged uncompSize bomb', () => {
  it('rejects a ZIP whose actual deflate output exceeds the forged small uncompSize', () => {
    // Build a real deflate of 10000 bytes, but forge uncompSize=10 in the archive.
    const realData = Buffer.alloc(10000, 0x42);
    const comp = deflateRawSync(realData, { level: 9 });
    const realCrc = 0; // deliberately wrong CRC; the size check should fire first

    // Manually construct a minimal ZIP with forged sizes
    const name = Buffer.from('pkg/bomb.bin', 'utf8');
    // Local file header
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(realCrc, 14);
    local.writeUInt32LE(comp.length, 18); // compSize = real
    local.writeUInt32LE(10, 22); // FORGED uncompSize = 10 (real is 10000)
    local.writeUInt16LE(name.length, 26);
    const localHeader = Buffer.concat([local, name]);

    // Central directory
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(realCrc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(10, 24); // FORGED
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(0, 42); // local offset
    const cdBuf = Buffer.concat([cd, name]);

    // EOCD
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(cdBuf.length, 12);
    eocd.writeUInt32LE(localHeader.length + comp.length, 16);

    const zip = Buffer.concat([localHeader, comp, cdBuf, eocd]);

    const dir = mkdtempSync(join(tmpdir(), 'zip-bomb-'));
    const out = join(dir, 'out');
    try {
      // Must throw due to maxOutputLength or size mismatch — NOT after full inflate
      expect(() => extractZipSafe(zip, out)).toThrow();
      // destDir must not exist
      expect(existsSync(out)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// --- P0-2/P0-3: destination safety + atomic rename ---
describe('P0-2: destination must not exist / symlink rejection', () => {
  it('rejects when destDir already exists as a directory', () => {
    const zip = buildZip([{ name: 'pkg/a.txt', data: Buffer.from('x') }]);
    const dir = mkdtempSync(join(tmpdir(), 'zip-exists-'));
    // dir already exists from mkdtemp — passing it directly must fail
    try {
      expect(() => extractZipSafe(zip, dir)).toThrow(/already exists/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects when destDir is a symlink (skip if symlinks unavailable)', () => {
    const zip = buildZip([{ name: 'pkg/a.txt', data: Buffer.from('x') }]);
    const dir = mkdtempSync(join(tmpdir(), 'zip-sym-'));
    const target = join(dir, 'target');
    const link = join(dir, 'link');
    mkdirSync(target);
    try {
      symlinkSync(target, link, 'dir');
    } catch {
      // Windows may require elevated privileges for symlinks; skip gracefully
      rmSync(dir, { recursive: true, force: true });
      return;
    }
    try {
      expect(() => extractZipSafe(zip, link)).toThrow(/already exists/);
      // target must remain empty (nothing written through the link)
      expect(existsSync(join(target, 'pkg', 'a.txt'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('on failure, destDir does not exist and no staging residue', () => {
    // Use CRC corruption to trigger failure after precheck
    const zip = buildZip([{ name: 'pkg/a.txt', data: Buffer.from('abc') }]);
    let eocdPos = -1;
    for (let i = zip.length - 22; i >= 0; i--) {
      if (zip.readUInt32LE(i) === 0x06054b50) {
        eocdPos = i;
        break;
      }
    }
    const cdOff = zip.readUInt32LE(eocdPos! + 16);
    zip.writeUInt32LE(0xdeadbeef, cdOff + 16); // corrupt CRC
    const dir = mkdtempSync(join(tmpdir(), 'zip-atomic-'));
    const out = join(dir, 'payload');
    try {
      expect(() => extractZipSafe(zip, out)).toThrow(/CRC/);
      expect(existsSync(out)).toBe(false);
      // No staging siblings left
      const siblings = readdirSync(dir);
      expect(siblings.filter((s: string) => s.startsWith('.zip-staging-'))).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// --- P1: ZIP format consistency checks ---
describe('P1: ZIP format consistency rejection', () => {
  const good = [{ name: 'pkg/hello.txt', data: Buffer.from('hello') }];

  function getEocdAndCd(zip: Buffer) {
    let eocdPos = -1;
    for (let i = zip.length - 22; i >= 0; i--) {
      if (zip.readUInt32LE(i) === 0x06054b50) {
        eocdPos = i;
        break;
      }
    }
    const cdOff = zip.readUInt32LE(eocdPos! + 16);
    return { eocdPos: eocdPos!, cdOff };
  }

  it('rejects multi-disk ZIP', () => {
    const zip = buildZip(good);
    const { eocdPos } = getEocdAndCd(zip);
    zip.writeUInt16LE(1, eocdPos + 4); // disk number != 0
    const dir = mkdtempSync(join(tmpdir(), 'zip-p1-'));
    try {
      expect(() => extractZipSafe(zip, join(dir, 'out'))).toThrow(/multi-disk/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects encrypted entries', () => {
    const zip = buildZip(good);
    const { cdOff } = getEocdAndCd(zip);
    const currentFlags = zip.readUInt16LE(cdOff + 8);
    zip.writeUInt16LE(currentFlags | 0x01, cdOff + 8);
    const dir = mkdtempSync(join(tmpdir(), 'zip-p1-'));
    try {
      expect(() => extractZipSafe(zip, join(dir, 'out'))).toThrow(/encrypt/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects data descriptor flag', () => {
    const zip = buildZip(good);
    const { cdOff } = getEocdAndCd(zip);
    const currentFlags = zip.readUInt16LE(cdOff + 8);
    zip.writeUInt16LE(currentFlags | 0x08, cdOff + 8);
    const dir = mkdtempSync(join(tmpdir(), 'zip-p1-'));
    try {
      expect(() => extractZipSafe(zip, join(dir, 'out'))).toThrow(/data descriptor/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects local-CD name mismatch', () => {
    const zip = buildZip(good);
    const { cdOff } = getEocdAndCd(zip);
    const localOff = zip.readUInt32LE(cdOff + 42);
    zip[localOff + 30] = 0x5a; // 'Z' instead of 'p'
    const dir = mkdtempSync(join(tmpdir(), 'zip-p1-'));
    try {
      expect(() => extractZipSafe(zip, join(dir, 'out'))).toThrow(/name differs/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// --- Item 1: extractZipFileSafe stat-before-read ---
describe('extractZipFileSafe: file size checked before read', () => {
  it('rejects an oversized ZIP file before reading it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zip-filesize-'));
    const bigFile = join(dir, 'big.zip');
    // Write a file larger than our test quota (use 200 bytes as quota)
    writeFileSync(bigFile, Buffer.alloc(300, 0x50));
    const out = join(dir, 'out');
    try {
      expect(() => extractZipFileSafe(bigFile, out, { maxZipFileBytes: 200 })).toThrow(
        /maxZipFileBytes/,
      );
      expect(existsSync(out)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('works end-to-end for a valid ZIP file within quota', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zip-fileok-'));
    const zipFile = join(dir, 'valid.zip');
    const zip = buildZip([{ name: 'pkg/x.txt', data: Buffer.from('ok') }]);
    writeFileSync(zipFile, zip);
    const out = join(dir, 'out');
    try {
      const written = extractZipFileSafe(zipFile, out);
      expect(written).toContain('pkg/x.txt');
      expect(readFileSync(join(out, 'pkg', 'x.txt'), 'utf8')).toBe('ok');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// --- Item 3: Additional local-CD consistency tests ---
describe('Local-CD full consistency (final round)', () => {
  const good = [{ name: 'pkg/hello.txt', data: Buffer.from('hello') }];

  function getEocdAndCd(zip: Buffer) {
    let eocdPos = -1;
    for (let i = zip.length - 22; i >= 0; i--) {
      if (zip.readUInt32LE(i) === 0x06054b50) {
        eocdPos = i;
        break;
      }
    }
    const cdOff = zip.readUInt32LE(eocdPos! + 16);
    return { eocdPos: eocdPos!, cdOff };
  }

  it('rejects when local flags differ from CD flags', () => {
    const zip = buildZip(good);
    const { cdOff } = getEocdAndCd(zip);
    const localOff = zip.readUInt32LE(cdOff + 42);
    // Change local flags to differ from CD (bit 11 UTF-8 flag off)
    zip.writeUInt16LE(0x0000, localOff + 6);
    const dir = mkdtempSync(join(tmpdir(), 'zip-flags-'));
    try {
      expect(() => extractZipSafe(zip, join(dir, 'out'))).toThrow(/flags differ/);
      expect(existsSync(join(dir, 'out'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects when local CRC differs from CD CRC', () => {
    const zip = buildZip(good);
    const { cdOff } = getEocdAndCd(zip);
    const localOff = zip.readUInt32LE(cdOff + 42);
    // Corrupt local CRC (byte 14-17 in local header)
    zip.writeUInt32LE(0x12345678, localOff + 14);
    const dir = mkdtempSync(join(tmpdir(), 'zip-lcrc-'));
    try {
      expect(() => extractZipSafe(zip, join(dir, 'out'))).toThrow(/sizes\/CRC differ/);
      expect(existsSync(join(dir, 'out'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects stored entry with compSize != uncompSize (forged in CD)', () => {
    // Build a stored ZIP (method 0) by using buildZip then patching method to 0
    // Actually easier: forge a minimal stored ZIP manually
    const name = Buffer.from('pkg/s.txt', 'utf8');
    const data = Buffer.from('stored-data');
    const crc = require('./zip.ts').crc32(data);
    // Local
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compSize = data.length
    local.writeUInt32LE(data.length, 22); // uncompSize = data.length
    local.writeUInt16LE(name.length, 26);
    const localH = Buffer.concat([local, name]);
    // CD with forged compSize != uncompSize
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(0, 10); // stored
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length + 5, 20); // forged compSize != uncompSize
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(0, 42);
    const cdBuf = Buffer.concat([cd, name]);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(cdBuf.length, 12);
    eocd.writeUInt32LE(localH.length + data.length, 16);
    const zip = Buffer.concat([localH, data, cdBuf, eocd]);
    const dir = mkdtempSync(join(tmpdir(), 'zip-stored-'));
    try {
      // The local header has correct sizes but CD has forged compSize
      // This will be caught by local sizes/CRC differ check
      expect(() => extractZipSafe(zip, join(dir, 'out'))).toThrow();
      expect(existsSync(join(dir, 'out'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects compSize=0 with uncompSize!=0', () => {
    const zip = buildZip(good);
    const { cdOff } = getEocdAndCd(zip);
    const localOff = zip.readUInt32LE(cdOff + 42);
    // Set compSize=0 in both CD and local, but keep uncompSize>0
    zip.writeUInt32LE(0, cdOff + 20); // CD compSize
    zip.writeUInt32LE(0, localOff + 18); // local compSize
    const dir = mkdtempSync(join(tmpdir(), 'zip-comp0-'));
    try {
      expect(() => extractZipSafe(zip, join(dir, 'out'))).toThrow(/compSize is 0/);
      expect(existsSync(join(dir, 'out'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// --- readZipFileSafe ---
describe('readZipFileSafe: shared disk-read entry', () => {
  it('rejects oversized file before reading', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zip-read-'));
    const bigFile = join(dir, 'big.zip');
    writeFileSync(bigFile, Buffer.alloc(500, 0x50));
    try {
      expect(() => readZipFileSafe(bigFile, { maxZipFileBytes: 200 })).toThrow(/maxZipFileBytes/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns Buffer for a valid file within quota', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zip-read-'));
    const zipFile = join(dir, 'ok.zip');
    const zip = buildZip([{ name: 'pkg/x.txt', data: Buffer.from('ok') }]);
    writeFileSync(zipFile, zip);
    try {
      const buf = readZipFileSafe(zipFile);
      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.length).toBe(zip.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// --- Strict EOCD/CD boundary (no gap) ---
describe('Strict EOCD/CD boundary: no gap allowed', () => {
  it('rejects a ZIP with garbage bytes between CD and EOCD', () => {
    const zip = buildZip([{ name: 'pkg/hello.txt', data: Buffer.from('hello') }]);
    // Insert 4 garbage bytes between CD and EOCD
    let eocdPos = -1;
    for (let i = zip.length - 22; i >= 0; i--) {
      if (zip.readUInt32LE(i) === 0x06054b50) {
        eocdPos = i;
        break;
      }
    }
    const garbage = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const corrupted = Buffer.concat([zip.subarray(0, eocdPos), garbage, zip.subarray(eocdPos)]);
    // Fix EOCD comment length (still 0) so file-size check passes,
    // but cdOffset + cdSize now != new eocdPos (eocdPos + 4)
    const dir = mkdtempSync(join(tmpdir(), 'zip-gap-'));
    try {
      expect(() => extractZipSafe(corrupted, join(dir, 'out'))).toThrow(
        /does not end exactly at EOCD/,
      );
      expect(existsSync(join(dir, 'out'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
