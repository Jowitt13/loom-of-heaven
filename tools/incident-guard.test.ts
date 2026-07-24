import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { USER_DEMO_PROMPT } from './lib/host-config.ts';

/**
 * Privacy guard (permanent): example/demo data shipped in the repo MUST be declared synthetic and
 * must never be a real person's birth information. Complements tools/scan-incident.ts (which
 * rejects the specific leaked PII); this asserts the positive contract for the demo prompt and the
 * smoke fixture so a future edit can't silently reintroduce un-labeled personal example data.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SYNTHETIC = /示例|虚构|synthetic|fictional/i;

describe('incident guard: example data declared synthetic (no real PII)', () => {
  it('USER_DEMO_PROMPT is labeled synthetic / fictional', () => {
    expect(SYNTHETIC.test(USER_DEMO_PROMPT)).toBe(true);
  });

  it('smoke fixture location is labeled fictional', () => {
    const smoke = JSON.parse(
      readFileSync(join(root, 'skills/calculate-birth-charts/scripts/fixtures/smoke.json'), 'utf8'),
    ) as { location?: { displayName?: string } };
    expect(SYNTHETIC.test(smoke.location?.displayName ?? '')).toBe(true);
  });

  it('every shipped example/test fixture declares synthetic (fixed path list)', () => {
    const files = [
      'packages/contracts/test/contracts.test.ts',
      'packages/orchestrator/test/bazi.test.ts',
      'packages/orchestrator/test/render.test.ts',
      'packages/orchestrator/test/western.test.ts',
      'packages/orchestrator/test/ziwei-horoscope.test.ts',
      'packages/orchestrator/test/ziwei.test.ts',
      'packages/time-location/test/solar-time.test.ts',
      'packages/western/test/houses.test.ts',
      'skills/calculate-birth-charts/references/input-contract.md',
    ];
    const missing = files.filter((f) => !SYNTHETIC.test(readFileSync(join(root, f), 'utf8')));
    expect(missing, `missing synthetic marker: ${missing.join(', ')}`).toEqual([]);
  });

  it('keeps the cloud gate free of private incident-token injection', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const cloud = pkg.scripts?.['verify:cloud'] ?? '';
    const full = pkg.scripts?.['verify:all'] ?? '';
    const requiredCloudStages = [
      'format:check',
      'lint',
      'typecheck',
      'test',
      'build',
      'validate:provenance',
      'validate:skill',
      'validate:reading',
      'validate:docs',
      'smoke',
      'forward:test',
      'package:hosts',
      'verify:hosts',
      'verify:install',
      'check:doc-counts',
      'scan:deps',
      'scan:secrets',
    ];

    for (const stage of requiredCloudStages) expect(cloud).toContain(`pnpm run ${stage}`);
    expect(cloud).not.toContain('scan:incident');
    expect(full).toBe('pnpm run verify:cloud && pnpm run scan:incident');

    const workflow = readFileSync(join(root, '.github/workflows/verify.yml'), 'utf8');
    expect(workflow).toContain('run: pnpm run verify:cloud');
    expect(workflow).not.toMatch(/INCIDENT_TOKENS|incident-tokens\.txt/);
  });
});
