// Offline stdin-mode tests for the license gate (scan-licenses.ts).
//
// The child argv below is fully literal; the license document is delivered on
// stdin exactly as the static `scan:licenses` script pipes it. The happy-path
// fixture is derived from the committed Skill SBOM so every SBOM cross-check
// passes deterministically. No package manager is ever started here.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

interface CdxComponent {
  name?: string;
  licenses?: { license?: { id?: string } }[];
}

function sbomClosureFixture(): Record<string, { name: string; versions: string[] }[]> {
  const sbom = JSON.parse(
    readFileSync(join(root, 'skills', 'xuan-ji-yu-heng', 'sbom.cdx.json'), 'utf8'),
  ) as { components?: CdxComponent[] };
  const fixture: Record<string, { name: string; versions: string[] }[]> = {};
  for (const component of sbom.components ?? []) {
    const license = component.licenses?.[0]?.license?.id;
    if (component.name === undefined || license === undefined) continue;
    (fixture[license] ??= []).push({ name: component.name, versions: ['0.0.0'] });
  }
  return fixture;
}

describe('license gate stdin tests (--licenses-stdin)', () => {
  function run(stdinText: string): { code: number; stdout: string } {
    const res = spawnSync(
      'node',
      ['--experimental-strip-types', 'tools/scan-licenses.ts', '--licenses-stdin'],
      {
        cwd: root,
        encoding: 'utf8',
        env: process.env,
        input: stdinText,
      },
    );
    return { code: res.status ?? 1, stdout: res.stdout ?? '' };
  }

  it('L1. valid stdin built from the committed SBOM closure -> exit 0', () => {
    const r = run(JSON.stringify(sbomClosureFixture()));
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('license checks passed.');
  });

  it('L2. stdin with a license outside the policy -> exit 1', () => {
    const fixture = sbomClosureFixture();
    fixture['GPL-3.0'] = [{ name: 'synth-pkg', versions: ['1.0.0'] }];
    const r = run(JSON.stringify(fixture));
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('[FAIL] license allowed: synth-pkg');
  });

  it('L3. empty stdin fails closed -> exit 1', () => {
    const r = run('');
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('[FAIL] license scan could not run');
    expect(r.stdout).toContain('empty or whitespace-only');
  });

  it('L4. whitespace-only stdin fails closed -> exit 1', () => {
    const r = run('   \n\t ');
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('empty or whitespace-only');
  });

  it('L5. non-JSON stdin fails closed -> exit 1', () => {
    const r = run('not json at all');
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('not parseable JSON');
  });

  it('L6. structurally invalid stdin (array) fails closed -> exit 1', () => {
    const r = run('[1,2,3]');
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('is not a pnpm licenses JSON document');
  });

  it('L7. --licenses-json together with --licenses-stdin fails closed -> exit 1', () => {
    const res = spawnSync(
      'node',
      [
        '--experimental-strip-types',
        'tools/scan-licenses.ts',
        '--licenses-json',
        'tools/absent-fixture.tmp.json',
        '--licenses-stdin',
      ],
      {
        cwd: root,
        encoding: 'utf8',
        env: process.env,
        input: '{}',
      },
    );
    expect(res.status).toBe(1);
    expect(res.stdout ?? '').toContain('choose exactly one license input');
  });

  it('L8. a sentinel in non-JSON stdin is not echoed', () => {
    const r = run('G0M1-SECRET-SENTINEL not json');
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('not parseable JSON');
    expect(r.stdout).not.toContain('G0M1-SECRET-SENTINEL');
  });
});
