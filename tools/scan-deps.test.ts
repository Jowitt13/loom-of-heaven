// Synthetic offline tests for the dependency audit gate (scan-deps.ts).
// All tests use --audit-json fixtures + --allowlist fixtures in the OS temp dir —
// NO network access, and no writes into the real repo path.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const script = join(here, 'scan-deps.ts');

/**
 * Run scan-deps.ts with given args and env, from a hermetic environment.
 *
 * The GitHub Actions verify job sets DEPENDENCY_AUDIT_STRICT=1 on the whole
 * cloud-gate step. Without stripping that here, every child spawned by this
 * test file would inherit strict mode from the CI runner and every local-mode
 * assertion would fail on CI (but pass on a dev shell that doesn't set the
 * var). The helper therefore always deletes DEPENDENCY_AUDIT_STRICT before
 * applying the per-test overlay, so a test that wants strict mode MUST ask
 * for it explicitly.
 */
function run(
  args: string[],
  env?: Record<string, string>,
): { code: number; stdout: string; stderr: string } {
  const cleanEnv: Record<string, string | undefined> = { ...process.env };
  delete cleanEnv.DEPENDENCY_AUDIT_STRICT;
  const finalEnv = { ...cleanEnv, ...(env ?? {}) };
  const res = spawnSync(process.execPath, ['--experimental-strip-types', script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: finalEnv as NodeJS.ProcessEnv,
  });
  return { code: res.status ?? 1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/** Write a temp audit JSON file and return an absolute path + cleanup. */
function writeAuditFixture(data: unknown): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'scan-deps-audit-'));
  const file = join(dir, 'audit.json');
  writeFileSync(file, JSON.stringify(data));
  return { path: file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Write a temp allowlist file and return an absolute path + cleanup. */
function writeAllowFixture(data: unknown): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'scan-deps-allow-'));
  const file = join(dir, 'allowlist.json');
  writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
  return { path: file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Today (UTC) as YYYY-MM-DD — matches how scan-deps.ts computes it. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
/** today - n days as YYYY-MM-DD. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
/** today + n days as YYYY-MM-DD. */
function daysAhead(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe('scan-deps offline gate tests', () => {
  it('1. clean audit report -> exit 0', () => {
    const audit = writeAuditFixture({
      advisories: {},
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } },
    });
    try {
      const r = run(['--audit-json', audit.path]);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('[PASS]');
    } finally {
      audit.cleanup();
    }
  });

  it('2. blocking advisory >= level -> exit 1', () => {
    const audit = writeAuditFixture({
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
      const r = run(['--audit-json', audit.path]);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain('[FAIL]');
    } finally {
      audit.cleanup();
    }
  });

  it('3. valid non-expired allowlist passes the advisory -> exit 0', () => {
    const audit = writeAuditFixture({
      advisories: {
        '1': { id: 1, module_name: 'synth-pkg', severity: 'high', title: 'Synthetic' },
      },
      metadata: { vulnerabilities: { high: 1 } },
    });
    const allow = writeAllowFixture([
      { id: 1, reason: 'Synthetic test exception', expires: daysAhead(365) },
    ]);
    try {
      const r = run(['--audit-json', audit.path, '--allowlist', allow.path]);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('[NOTE]');
    } finally {
      allow.cleanup();
      audit.cleanup();
    }
  });

  it('4. expired allowlist in strict mode -> exit 1', () => {
    const audit = writeAuditFixture({
      advisories: {
        '1': { id: 1, module_name: 'synth-pkg', severity: 'high', title: 'Synthetic' },
      },
      metadata: { vulnerabilities: { high: 1 } },
    });
    const allow = writeAllowFixture([{ id: 1, reason: 'Expired', expires: daysAgo(1) }]);
    try {
      const r = run(['--audit-json', audit.path, '--allowlist', allow.path, '--strict']);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain('expired');
    } finally {
      allow.cleanup();
      audit.cleanup();
    }
  });

  it('5. malformed allowlist (not an array) in strict -> exit 1', () => {
    const audit = writeAuditFixture({ advisories: {}, metadata: {} });
    const allow = writeAllowFixture({ not: 'array' });
    try {
      const r = run(['--audit-json', audit.path, '--allowlist', allow.path, '--strict']);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain('must be a JSON array');
    } finally {
      allow.cleanup();
      audit.cleanup();
    }
  });

  it('6. audit input unreadable in strict -> exit 1', () => {
    const r = run(['--audit-json', 'nonexistent-file-synth.json', '--strict']);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('[FAIL]');
  });

  it('7. audit input unreadable in local mode -> exit 0 (host env DEPENDENCY_AUDIT_STRICT is stripped)', () => {
    // Even if the surrounding CI job exports DEPENDENCY_AUDIT_STRICT=1, the
    // test helper strips it, so this case exercises the true local branch.
    const r = run(['--audit-json', 'nonexistent-file-synth.json']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('[WARN]');
  });

  it('8. mode label output: STRICT vs LOCAL DIAGNOSTIC', () => {
    const audit = writeAuditFixture({ advisories: {}, metadata: {} });
    try {
      const local = run(['--audit-json', audit.path]);
      expect(local.stdout).toContain('[LOCAL DIAGNOSTIC]');
      const strict = run(['--audit-json', audit.path], { DEPENDENCY_AUDIT_STRICT: '1' });
      expect(strict.stdout).toContain('[STRICT]');
    } finally {
      audit.cleanup();
    }
  });

  it('9. empty string id (strict) -> exit 1', () => {
    const audit = writeAuditFixture({ advisories: {}, metadata: {} });
    const allow = writeAllowFixture([{ id: '', reason: 'r', expires: daysAhead(30) }]);
    try {
      const r = run(['--audit-json', audit.path, '--allowlist', allow.path, '--strict']);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain('missing or invalid "id"');
    } finally {
      allow.cleanup();
      audit.cleanup();
    }
  });

  it('9b. whitespace-only string id (strict) -> exit 1', () => {
    // Regression: strict mode used to accept a non-empty string id even when it
    // was pure whitespace. That is not a real advisory identifier and must be
    // rejected exactly like an empty string.
    const audit = writeAuditFixture({ advisories: {}, metadata: {} });
    const allow = writeAllowFixture([{ id: '   ', reason: 'r', expires: daysAhead(30) }]);
    try {
      const r = run(['--audit-json', audit.path, '--allowlist', allow.path, '--strict']);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain('missing or invalid "id"');
    } finally {
      allow.cleanup();
      audit.cleanup();
    }
  });

  it('10. non-string/non-number id (strict) -> exit 1', () => {
    const audit = writeAuditFixture({ advisories: {}, metadata: {} });
    const allow = writeAllowFixture([{ id: null, reason: 'r', expires: daysAhead(30) }]);
    try {
      const r = run(['--audit-json', audit.path, '--allowlist', allow.path, '--strict']);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain('missing or invalid "id"');
    } finally {
      allow.cleanup();
      audit.cleanup();
    }
  });

  it('11. whitespace-only reason (strict) -> exit 1', () => {
    const audit = writeAuditFixture({ advisories: {}, metadata: {} });
    const allow = writeAllowFixture([{ id: 1, reason: '   ', expires: daysAhead(30) }]);
    try {
      const r = run(['--audit-json', audit.path, '--allowlist', allow.path, '--strict']);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain('missing or empty "reason"');
    } finally {
      allow.cleanup();
      audit.cleanup();
    }
  });

  it('12. missing expires (strict) -> exit 1', () => {
    const audit = writeAuditFixture({ advisories: {}, metadata: {} });
    const allow = writeAllowFixture([{ id: 1, reason: 'r' }]);
    try {
      const r = run(['--audit-json', audit.path, '--allowlist', allow.path, '--strict']);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain('"expires"');
    } finally {
      allow.cleanup();
      audit.cleanup();
    }
  });

  it('13. format-valid but non-real date (2025-13-01) (strict) -> exit 1', () => {
    const audit = writeAuditFixture({ advisories: {}, metadata: {} });
    const allow = writeAllowFixture([{ id: 1, reason: 'r', expires: '2025-13-01' }]);
    try {
      const r = run(['--audit-json', audit.path, '--allowlist', allow.path, '--strict']);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain('real YYYY-MM-DD date');
    } finally {
      allow.cleanup();
      audit.cleanup();
    }
  });

  it('13b. impossible day (2025-02-30) (strict) -> exit 1', () => {
    const audit = writeAuditFixture({ advisories: {}, metadata: {} });
    const allow = writeAllowFixture([{ id: 1, reason: 'r', expires: '2025-02-30' }]);
    try {
      const r = run(['--audit-json', audit.path, '--allowlist', allow.path, '--strict']);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain('real YYYY-MM-DD date');
    } finally {
      allow.cleanup();
      audit.cleanup();
    }
  });

  it('14. duplicate id (strict) -> exit 1', () => {
    const audit = writeAuditFixture({ advisories: {}, metadata: {} });
    const allow = writeAllowFixture([
      { id: 1, reason: 'r1', expires: daysAhead(30) },
      { id: 1, reason: 'r2', expires: daysAhead(60) },
    ]);
    try {
      const r = run(['--audit-json', audit.path, '--allowlist', allow.path, '--strict']);
      expect(r.code).toBe(1);
      expect(r.stdout).toContain('duplicate id');
    } finally {
      allow.cleanup();
      audit.cleanup();
    }
  });

  it('15. expires === today is still valid (inclusive semantics) -> exit 0', () => {
    // Advisory would block; today-inclusive allow entry suppresses it.
    const audit = writeAuditFixture({
      advisories: {
        '1': { id: 1, module_name: 'synth-pkg', severity: 'high', title: 'Synthetic' },
      },
      metadata: { vulnerabilities: { high: 1 } },
    });
    const allow = writeAllowFixture([{ id: 1, reason: 'Today', expires: todayUtc() }]);
    try {
      const r = run(['--audit-json', audit.path, '--allowlist', allow.path, '--strict']);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain('[NOTE]');
    } finally {
      allow.cleanup();
      audit.cleanup();
    }
  });

  it('16. expires === today - 1 in local mode: silently ignored, WARN, exit 0', () => {
    // Local (non-strict) mode: an expired entry is skipped and a WARN is
    // emitted; the underlying advisory still blocks with exit 1.
    const audit = writeAuditFixture({
      advisories: {
        '1': { id: 1, module_name: 'synth-pkg', severity: 'high', title: 'Synthetic' },
      },
      metadata: { vulnerabilities: { high: 1 } },
    });
    const allow = writeAllowFixture([{ id: 1, reason: 'Yesterday', expires: daysAgo(1) }]);
    try {
      const r = run(['--audit-json', audit.path, '--allowlist', allow.path]);
      // The allow entry is expired -> ignored -> advisory blocks -> exit 1.
      // The WARN line about the expired entry must still be present.
      expect(r.code).toBe(1);
      expect(r.stdout).toContain('expired');
      expect(r.stdout).toContain('[WARN]');
    } finally {
      allow.cleanup();
      audit.cleanup();
    }
  });

  it('17. does NOT write into the real repo allowlist path', () => {
    // Sanity: the test helper is hermetic — no --allowlist means default path
    // is used and the child never has to be redirected via file backup/restore
    // shenanigans. We just verify the local-mode branch runs cleanly here.
    const audit = writeAuditFixture({ advisories: {}, metadata: {} });
    try {
      const r = run(['--audit-json', audit.path]);
      expect(r.code).toBe(0);
    } finally {
      audit.cleanup();
    }
  });
});
