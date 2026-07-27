// Synthetic offline tests for the dependency audit gate (scan-deps.ts).
// All tests use --audit-json fixtures and temp allowlists — NO network access.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const script = join(here, 'scan-deps.ts');

/** Run scan-deps.ts with given args and environment. */
function run(
  args: string[],
  env?: Record<string, string>,
): { code: number; stdout: string; stderr: string } {
  const res = spawnSync(process.execPath, ['--experimental-strip-types', script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { code: res.status ?? 1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** Write a temp audit JSON file and return its relative path from root. */
function writeFixture(data: unknown): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'scan-deps-test-'));
  const file = join(dir, 'audit.json');
  writeFileSync(file, JSON.stringify(data));
  return { path: file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('scan-deps offline gate tests', () => {
  it('1. clean audit report → exit 0', () => {
    const { path, cleanup } = writeFixture({
      advisories: {},
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } },
    });
    try {
      const r = run(['--audit-json', path]);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('[PASS]');
    } finally {
      cleanup();
    }
  });

  it('2. blocking advisory >= level → exit 1', () => {
    const { path, cleanup } = writeFixture({
      advisories: {
        '1': {
          id: 1,
          module_name: 'synth-pkg',
          severity: 'high',
          title: 'Synthetic advisory',
          github_advisory_id: 'GHSA-synth-0001',
        },
      },
      metadata: { vulnerabilities: { high: 1 } },
    });
    try {
      const r = run(['--audit-json', path]);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain('[FAIL]');
    } finally {
      cleanup();
    }
  });

  it('3. valid non-expired allowlist passes the advisory → exit 0', () => {
    const { path, cleanup } = writeFixture({
      advisories: {
        '1': { id: 1, module_name: 'synth-pkg', severity: 'high', title: 'Synthetic' },
      },
      metadata: { vulnerabilities: { high: 1 } },
    });
    // Write a temp allowlist
    const allowDir = mkdtempSync(join(tmpdir(), 'scan-deps-allow-'));
    const allowFile = join(root, 'tools', 'scan-deps.allowlist.json');
    const allowBackup = join(allowDir, 'backup.json');
    // Temporarily place allowlist (we'll remove it after)
    const futureDate = '2099-12-31';
    const allowContent = [{ id: 1, reason: 'Synthetic test exception', expires: futureDate }];
    let hadExisting = false;
    try {
      const { existsSync, copyFileSync } = require('node:fs') as typeof import('node:fs');
      if (existsSync(allowFile)) {
        copyFileSync(allowFile, allowBackup);
        hadExisting = true;
      }
      writeFileSync(allowFile, JSON.stringify(allowContent));
      const r = run(['--audit-json', path]);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('[NOTE]');
    } finally {
      // Restore
      const { copyFileSync, unlinkSync } = require('node:fs');
      if (hadExisting) {
        copyFileSync(allowBackup, allowFile);
      } else {
        try {
          unlinkSync(allowFile);
        } catch {}
      }
      rmSync(allowDir, { recursive: true, force: true });
      cleanup();
    }
  });

  it('4. expired allowlist in strict mode → exit 1', () => {
    const { path, cleanup } = writeFixture({
      advisories: {
        '1': { id: 1, module_name: 'synth-pkg', severity: 'high', title: 'Synthetic' },
      },
      metadata: { vulnerabilities: { high: 1 } },
    });
    const allowDir = mkdtempSync(join(tmpdir(), 'scan-deps-allow-'));
    const allowFile = join(root, 'tools', 'scan-deps.allowlist.json');
    const allowBackup = join(allowDir, 'backup.json');
    const expiredAllow = [{ id: 1, reason: 'Expired test', expires: '2020-01-01' }];
    let hadExisting = false;
    try {
      const { existsSync, copyFileSync } = require('node:fs');
      if (existsSync(allowFile)) {
        copyFileSync(allowFile, allowBackup);
        hadExisting = true;
      }
      writeFileSync(allowFile, JSON.stringify(expiredAllow));
      const r = run(['--audit-json', path, '--strict']);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain('expired');
    } finally {
      const { copyFileSync, unlinkSync } = require('node:fs');
      if (hadExisting) copyFileSync(allowBackup, allowFile);
      else
        try {
          unlinkSync(allowFile);
        } catch {}
      rmSync(allowDir, { recursive: true, force: true });
      cleanup();
    }
  });

  it('5. malformed allowlist in strict → exit 1', () => {
    const { path, cleanup } = writeFixture({ advisories: {}, metadata: {} });
    const allowFile = join(root, 'tools', 'scan-deps.allowlist.json');
    const allowDir = mkdtempSync(join(tmpdir(), 'scan-deps-allow-'));
    const allowBackup = join(allowDir, 'backup.json');
    let hadExisting = false;
    try {
      const { existsSync, copyFileSync } = require('node:fs');
      if (existsSync(allowFile)) {
        copyFileSync(allowFile, allowBackup);
        hadExisting = true;
      }
      // Not an array
      writeFileSync(allowFile, '{"not": "array"}');
      const r = run(['--audit-json', path, '--strict']);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain('must be a JSON array');
    } finally {
      const { copyFileSync, unlinkSync } = require('node:fs');
      if (hadExisting) copyFileSync(allowBackup, allowFile);
      else
        try {
          unlinkSync(allowFile);
        } catch {}
      rmSync(allowDir, { recursive: true, force: true });
      cleanup();
    }
  });

  it('6. audit input unreadable in strict → exit 1', () => {
    const r = run(['--audit-json', 'nonexistent-file-synth.json', '--strict']);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('[FAIL]');
  });

  it('7. audit input unreadable in local mode → exit 0', () => {
    const r = run(['--audit-json', 'nonexistent-file-synth.json']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('[WARN]');
  });

  it('8. mode label output: STRICT vs LOCAL DIAGNOSTIC', () => {
    const { path, cleanup } = writeFixture({ advisories: {}, metadata: {} });
    try {
      const local = run(['--audit-json', path]);
      expect(local.stdout).toContain('[LOCAL DIAGNOSTIC]');
      const strict = run(['--audit-json', path], { DEPENDENCY_AUDIT_STRICT: '1' });
      expect(strict.stdout).toContain('[STRICT]');
    } finally {
      cleanup();
    }
  });
});
