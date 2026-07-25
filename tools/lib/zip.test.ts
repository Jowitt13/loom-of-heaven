import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertSingleTopDir, buildZip, extractZip, listZipEntries } from './zip.ts';

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
    try {
      const written = extractZip(zip, dir);
      expect(written.sort()).toEqual(files.map((f) => f.name).sort());
      for (const f of files) {
        expect(readFileSync(join(dir, ...f.name.split('/')))).toEqual(f.data);
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
