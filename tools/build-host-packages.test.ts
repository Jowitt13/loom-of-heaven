import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildHostZips } from './build-host-packages.ts';
import { assertDistinctReleaseTags, CANDIDATE_ENGINE_VERSION } from './lib/host-config.ts';
import { ENGINE_VERSION } from '../packages/contracts/src/version.ts';
import {
  assertSingleTopDir,
  isTextEntry,
  listZipEntries,
  normalizeZipEntryData,
} from './lib/zip.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const srcSkill = join(root, 'skills', 'xuan-ji-yu-heng');

/** Rewrite every text file under `dir` to the given line ending, in place. */
function rewriteLineEndings(dir: string, eol: '\n' | '\r\n'): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      rewriteLineEndings(abs, eol);
    } else if (e.isFile() && isTextEntry(e.name)) {
      const lf = readFileSync(abs).toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      writeFileSync(abs, eol === '\n' ? lf : lf.replace(/\n/g, '\r\n'), 'utf8');
    }
  }
}

describe('release version model: published vs candidate tags', () => {
  it('accepts distinct published and candidate release tags', () => {
    expect(assertDistinctReleaseTags().ok).toBe(true);
    expect(CANDIDATE_ENGINE_VERSION).toBe(ENGINE_VERSION);
  });

  it('rejects identical published and candidate tags (negative)', () => {
    const res = assertDistinctReleaseTags('v0.1.1', 'v0.1.1');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/must differ/);
  });
});

describe('normalizeZipEntryData', () => {
  it('collapses CRLF/CR to LF for text and leaves binary/NUL data untouched', () => {
    expect(normalizeZipEntryData('LICENSE', Buffer.from('a\r\nb\rc\n')).toString()).toBe(
      'a\nb\nc\n',
    );
    expect(normalizeZipEntryData('SKILL.md', Buffer.from('x\r\ny')).toString()).toBe('x\ny');
    const png = Buffer.from([0x89, 0x50, 0x0d, 0x0a, 0x00, 0x0d, 0x0a]); // has NUL + CRLF
    expect(normalizeZipEntryData('icon.png', png).equals(png)).toBe(true);
    const nul = Buffer.from([0x61, 0x0d, 0x0a, 0x00]); // text-looking name but NUL byte
    expect(normalizeZipEntryData('weird.txt', nul).equals(nul)).toBe(true);
  });
});

describe('cross-platform reproducible host packaging (real build path)', () => {
  // Builds 8 real ZIPs (4 hosts × 2 line-ending trees) — routinely ~4-5 s, right at the
  // default 5 s timeout under a loaded full-suite run, so give it explicit headroom.
  it('LF and CRLF Skill inputs yield byte-identical host ZIP SHA-256', { timeout: 30_000 }, () => {
    const work = mkdtempSync(join(tmpdir(), 'ming-crlf-'));
    try {
      const lfSrc = join(work, 'lf-src');
      const crlfSrc = join(work, 'crlf-src');
      cpSync(srcSkill, lfSrc, { recursive: true });
      cpSync(srcSkill, crlfSrc, { recursive: true });
      rewriteLineEndings(lfSrc, '\n');
      rewriteLineEndings(crlfSrc, '\r\n');

      const lf = buildHostZips(lfSrc, join(work, 'lf-out'));
      const crlf = buildHostZips(crlfSrc, join(work, 'crlf-out'));

      expect(lf.length).toBe(crlf.length);
      for (const a of lf) {
        const b = crlf.find((x) => x.host.id === a.host.id)!;
        // The whole point of v0.1.2: CRLF vs LF working tree -> identical archive bytes.
        expect(a.sha256, `${a.host.id} sha256`).toBe(b.sha256);
        expect(a.verified && b.verified).toBe(true);
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it(
    'each host ZIP is single-top-dir, no double nesting, and ships the engine',
    { timeout: 30_000 },
    () => {
      const work = mkdtempSync(join(tmpdir(), 'ming-struct-'));
      try {
        const built = buildHostZips(srcSkill, join(work, 'out'));
        for (const b of built) {
          const entries = listZipEntries(b.zip);
          const struct = assertSingleTopDir(entries, b.host.packageName);
          expect(struct.ok, `${b.host.id}: ${struct.error ?? ''}`).toBe(true);
          expect(entries).toContain(`${b.host.packageName}/scripts/dist/engine.mjs`);
          expect(
            entries.some((e) => e.startsWith(`${b.host.packageName}/${b.host.packageName}/`)),
          ).toBe(false);
        }
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    },
  );

  it('builds correctly when the workspace parent directory contains .tmp in its name', () => {
    // Regression: isExcluded must not match .tmp in parent path, only in Skill-relative path.
    const parentWithTmp = mkdtempSync(join(tmpdir(), '.tmp-parent-'));
    const work = join(parentWithTmp, 'staging');
    const fakeSkill = join(parentWithTmp, 'skill-src');
    try {
      // Create a minimal synthetic Skill under a '.tmp'-named parent
      mkdirSync(join(fakeSkill, 'scripts', 'dist'), { recursive: true });
      mkdirSync(join(fakeSkill, 'references'), { recursive: true });
      writeFileSync(join(fakeSkill, 'SKILL.md'), '# Synthetic Skill\n');
      writeFileSync(join(fakeSkill, 'LICENSE'), 'MIT\n');
      writeFileSync(join(fakeSkill, 'scripts', 'dist', 'engine.mjs'), 'export const x = 1;\n');
      writeFileSync(join(fakeSkill, 'scripts', 'loom-chart.mjs'), '#!/usr/bin/env node\n');
      writeFileSync(join(fakeSkill, 'references', 'answer-contract.md'), '# contract\n');
      mkdirSync(join(fakeSkill, 'agents'), { recursive: true });
      writeFileSync(join(fakeSkill, 'agents', 'openai.yaml'), 'name: test\n');
      mkdirSync(join(fakeSkill, 'assets'), { recursive: true });
      writeFileSync(join(fakeSkill, 'assets', 'report-template.html'), '<html></html>');

      const zips = buildHostZips(fakeSkill, work);
      expect(zips.length).toBeGreaterThan(0);
      for (const b of zips) {
        const entries = listZipEntries(b.zip);
        expect(entries.length).toBeGreaterThan(0);
        expect(entries).toContain(`${b.host.packageName}/SKILL.md`);
        // Full hosts should have the engine
        if (b.host.capability !== 'reading-lite') {
          expect(entries).toContain(`${b.host.packageName}/scripts/dist/engine.mjs`);
        }
      }
    } finally {
      rmSync(parentWithTmp, { recursive: true, force: true });
    }
  });
});
