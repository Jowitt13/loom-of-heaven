// Synthetic fixtures only - fictional data; not a real person. fixtureKind: synthetic-technical.
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  activateCareerReflectionConsent,
  CONSENT_FILE_NAME,
  deleteCareerReflectionConsent,
  grantCareerReflectionConsent,
  readCareerReflectionConsent,
  CareerReflectionConsentError,
} from '../src/career-reflection-consent.ts';

const T0 = '2026-09-08T00:00:00Z';
const T1 = '2026-09-08T01:00:00Z';
const T2 = '2026-09-08T02:00:00Z';

function newStateDirectory(): string {
  return mkdtempSync(join(tmpdir(), 'c4d-consent-'));
}

describe('C-4D career reflection consent lifecycle', () => {
  it('reports not-started when no state file exists and creates nothing', () => {
    const dir = newStateDirectory();
    expect(readCareerReflectionConsent(dir)).toEqual({ state: 'not-started' });
    expect(existsSync(join(dir, CONSENT_FILE_NAME))).toBe(false);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('grants consent writing only the frozen fields, deterministically', () => {
    const dir = newStateDirectory();
    const record = grantCareerReflectionConsent(dir, { grantedAt: T0 });
    expect(record).toEqual({
      contractVersion: 'career-reflection-consent/v1',
      scope: 'career-reflection',
      noticeVersion: 'career-reflection-notice/v1',
      state: 'consented',
      updatedAt: T0,
    });
    expect(readdirSync(dir).sort()).toEqual(['consent.json']);
    expect(readCareerReflectionConsent(dir)).toEqual(record);
  });

  it('activates only from consented and reports active', () => {
    const dir = newStateDirectory();
    grantCareerReflectionConsent(dir, { grantedAt: T0 });
    const record = activateCareerReflectionConsent(dir, { activatedAt: T1 });
    expect(record.state).toBe('active');
    expect(record.updatedAt).toBe(T1);
    expect(readCareerReflectionConsent(dir).state).toBe('active');
  });

  it('rejects activation without prior consent and repeated transitions', () => {
    const dir = newStateDirectory();
    expect(() => activateCareerReflectionConsent(dir, { activatedAt: T1 })).toThrow(
      CareerReflectionConsentError,
    );
    grantCareerReflectionConsent(dir, { grantedAt: T0 });
    expect(() => grantCareerReflectionConsent(dir, { grantedAt: T1 })).toThrow(
      CareerReflectionConsentError,
    );
    activateCareerReflectionConsent(dir, { activatedAt: T1 });
    expect(() => activateCareerReflectionConsent(dir, { activatedAt: T2 })).toThrow(
      CareerReflectionConsentError,
    );
    expect(() => grantCareerReflectionConsent(dir, { grantedAt: T2 })).toThrow(
      CareerReflectionConsentError,
    );
  });

  it('deletes only the fixed consent file and returns a structured deleted result', () => {
    const dir = newStateDirectory();
    writeFileSync(join(dir, 'unrelated.txt'), 'keep me');
    grantCareerReflectionConsent(dir, { grantedAt: T0 });
    activateCareerReflectionConsent(dir, { activatedAt: T1 });
    const result = deleteCareerReflectionConsent(dir, { deletedAt: T2 });
    expect(result).toEqual({ state: 'deleted', deletedAt: T2 });
    expect(existsSync(join(dir, CONSENT_FILE_NAME))).toBe(false);
    expect(existsSync(join(dir, 'unrelated.txt'))).toBe(true);
    expect(readCareerReflectionConsent(dir)).toEqual({ state: 'not-started' });
  });

  it('refuses withdrawal when nothing was ever consented', () => {
    const dir = newStateDirectory();
    expect(() => deleteCareerReflectionConsent(dir, { deletedAt: T2 })).toThrow(
      CareerReflectionConsentError,
    );
  });

  it('fail-closes on invalid timestamps', () => {
    const dir = newStateDirectory();
    expect(() => grantCareerReflectionConsent(dir, { grantedAt: '2026-09-08 01:00' })).toThrow(
      CareerReflectionConsentError,
    );
    grantCareerReflectionConsent(dir, { grantedAt: T0 });
    expect(() => activateCareerReflectionConsent(dir, { activatedAt: 'not-a-time' })).toThrow(
      CareerReflectionConsentError,
    );
  });

  it('fail-closes on corrupted JSON, half-written records, and forbidden or unknown fields', () => {
    const dir = newStateDirectory();
    mkdirAndWrite(dir, CONSENT_FILE_NAME, '{ not json');
    expect(() => readCareerReflectionConsent(dir)).toThrow(CareerReflectionConsentError);

    mkdirAndWrite(dir, CONSENT_FILE_NAME, '{"contractVersion":"career-reflection-consent/v1"');
    expect(() => readCareerReflectionConsent(dir)).toThrow(CareerReflectionConsentError);

    mkdirAndWrite(
      dir,
      CONSENT_FILE_NAME,
      JSON.stringify({
        contractVersion: 'career-reflection-consent/v1',
        scope: 'career-reflection',
        noticeVersion: 'career-reflection-notice/v1',
        state: 'consented',
        updatedAt: T0,
        userId: 'u-123',
      }),
    );
    expect(() => readCareerReflectionConsent(dir)).toThrow(CareerReflectionConsentError);

    mkdirAndWrite(
      dir,
      CONSENT_FILE_NAME,
      JSON.stringify({
        contractVersion: 'career-reflection-consent/v1',
        scope: 'career-reflection',
        noticeVersion: 'career-reflection-notice/v1',
        state: 'active',
        updatedAt: T0,
        rawAnswer: '合成原始回答',
        score: 42,
      }),
    );
    expect(() => readCareerReflectionConsent(dir)).toThrow(CareerReflectionConsentError);

    mkdirAndWrite(
      dir,
      CONSENT_FILE_NAME,
      JSON.stringify({
        contractVersion: 'career-reflection-consent/v1',
        scope: 'career-reflection',
        noticeVersion: 'career-reflection-notice/v1',
        state: 'not-started',
        updatedAt: T0,
      }),
    );
    expect(() => readCareerReflectionConsent(dir)).toThrow(CareerReflectionConsentError);
  });

  it('fail-closes on path traversal, relative paths, control characters, and dynamic file names', () => {
    // String concatenation (not join) so the traversal segment survives into
    // the module, mirroring an unnormalized caller-supplied directory.
    const traversal = `${newStateDirectory()}\\..\\escape`;
    expect(() => readCareerReflectionConsent(traversal)).toThrow(CareerReflectionConsentError);
    expect(() => readCareerReflectionConsent('relative/dir')).toThrow(CareerReflectionConsentError);
    expect(() => readCareerReflectionConsent('')).toThrow(CareerReflectionConsentError);
    expect(() => grantCareerReflectionConsent('dir\ninjected', { grantedAt: T0 })).toThrow(
      CareerReflectionConsentError,
    );
  });

  it('does not echo the state directory or file contents in errors', () => {
    const dir = newStateDirectory();
    try {
      readCareerReflectionConsent(dir + '/deeper');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain(dir);
      expect(message).toBe('INVALID_STATE_DIRECTORY');
    }
  });

  it('keeps the lifecycle module outside the package index and runtime surfaces', () => {
    const readModule = (relativePath: string): string =>
      readRootFile(join(rootPath(), relativePath), 'utf8');
    expect(readModule('packages/orchestrator/src/index.ts')).not.toContain(
      'career-reflection-consent',
    );
    for (const relative of [
      'packages/orchestrator/src/engine-entry.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
      'skills/xuan-ji-yu-heng/SKILL.md',
      'skills/psychology-self-assessment/SKILL.md',
      'packages/contracts/src/index.ts',
      'packages/interpret/src/index.ts',
      'package.json',
    ]) {
      expect(readModule(relative), relative).not.toContain('career-reflection-consent');
    }
  });
});

// -- helpers -----------------------------------------------------------------

import { readFileSync as readRootFile } from 'node:fs';
import { dirname as dirnameOf, join as joinPaths } from 'node:path';
import { fileURLToPath } from 'node:url';

function rootPath(): string {
  return joinPaths(dirnameOf(fileURLToPath(import.meta.url)), '..', '..', '..');
}

function mkdirAndWrite(dir: string, fileName: string, content: string): void {
  rmSync(join(dir, fileName), { force: true });
  writeFileSync(join(dir, fileName), content, 'utf8');
}
