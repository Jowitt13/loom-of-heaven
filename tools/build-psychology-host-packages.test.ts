import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildPsychologyHostZips } from './build-psychology-host-packages.ts';
import {
  PSYCHOLOGY_CANDIDATE_TAG,
  PSYCHOLOGY_HOSTS,
  PSYCHOLOGY_SKILL_NAME,
  assertPsychologyCandidateBoundary,
} from './lib/psychology-host-config.ts';
import { assertSingleTopDir, isTextEntry, listZipEntries } from './lib/zip.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const source = join(root, 'skills', PSYCHOLOGY_SKILL_NAME);

function rewriteTextLineEndings(dir: string, eol: '\n' | '\r\n'): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) rewriteTextLineEndings(path, eol);
    if (!entry.isFile() || !isTextEntry(entry.name)) continue;
    const normalized = readFileSync(path, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    writeFileSync(path, eol === '\n' ? normalized : normalized.replace(/\n/g, '\r\n'), 'utf8');
  }
}

describe('P9 independent candidate release model', () => {
  it('has a reserved independent candidate tag and rejects an already-published collision', () => {
    expect(assertPsychologyCandidateBoundary().ok).toBe(true);
    expect(assertPsychologyCandidateBoundary('v0.1.0').ok).toBe(false);
    expect(
      assertPsychologyCandidateBoundary(PSYCHOLOGY_CANDIDATE_TAG, PSYCHOLOGY_CANDIDATE_TAG).ok,
    ).toBe(false);
  });

  it('makes one single-root candidate ZIP per supported host with the isolated SBOMs', () => {
    const work = mkdtempSync(join(tmpdir(), 'loom-p9-host-structure-'));
    try {
      const built = buildPsychologyHostZips(source, join(work, 'out'));
      expect(built).toHaveLength(PSYCHOLOGY_HOSTS.length);
      for (const bundle of built) {
        const entries = listZipEntries(bundle.zip);
        expect(assertSingleTopDir(entries, PSYCHOLOGY_SKILL_NAME).ok).toBe(true);
        expect(entries).toContain(`${PSYCHOLOGY_SKILL_NAME}/sbom.cdx.json`);
        expect(entries).toContain(`${PSYCHOLOGY_SKILL_NAME}/sbom.spdx.json`);
        expect(entries).toContain(`${PSYCHOLOGY_SKILL_NAME}/scripts/dist/psychology-engine.mjs`);
        expect(
          entries.some((entry) =>
            entry.startsWith(`${PSYCHOLOGY_SKILL_NAME}/${PSYCHOLOGY_SKILL_NAME}/`),
          ),
        ).toBe(false);
        expect(bundle.verified).toBe(true);
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it('makes byte-identical P9 host ZIPs from LF and CRLF source trees', { timeout: 30_000 }, () => {
    const work = mkdtempSync(join(tmpdir(), 'loom-p9-host-eol-'));
    try {
      const lfSource = join(work, 'lf');
      const crlfSource = join(work, 'crlf');
      cpSync(source, lfSource, { recursive: true });
      cpSync(source, crlfSource, { recursive: true });
      rewriteTextLineEndings(lfSource, '\n');
      rewriteTextLineEndings(crlfSource, '\r\n');
      const lf = buildPsychologyHostZips(lfSource, join(work, 'lf-out'));
      const crlf = buildPsychologyHostZips(crlfSource, join(work, 'crlf-out'));
      for (const bundle of lf) {
        const counterpart = crlf.find((candidate) => candidate.host.id === bundle.host.id);
        expect(counterpart?.sha256, bundle.host.id).toBe(bundle.sha256);
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
