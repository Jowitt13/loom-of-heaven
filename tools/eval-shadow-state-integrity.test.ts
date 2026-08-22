import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BaziChartResult } from '../packages/contracts/src/bazi.ts';
import { projectBaziShadowState } from '../packages/bazi-rules/src/shadow-state.ts';
import { canonicalSha256 } from './eval/verify-eval-manifest.ts';
import { verifySyntheticShadowStateIntegrity } from './eval/verify-shadow-state-integrity.ts';

const root = join(__dirname, '..');
const manifestPath = join(
  root,
  'evals',
  'fixtures',
  'synthetic',
  'p0e-shadow-state-integrity-manifest.json',
);
const chartPath = join(root, 'evals', 'fixtures', 'synthetic', 'p0e-bazi-shadow-chart.json');
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

function manifest(): Record<string, unknown> {
  return readJson(manifestPath) as Record<string, unknown>;
}

function chart(): Record<string, unknown> {
  return readJson(chartPath) as Record<string, unknown>;
}

function copy(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function issueCodes(manifestValue: unknown, chartValue: unknown): string[] {
  return verifySyntheticShadowStateIntegrity(manifestValue, chartValue).issues.map(
    (issue) => issue.code,
  );
}

describe('P0-E synthetic shadow-state integrity fixture', () => {
  it('rebuilds the committed synthetic state with the declared canonical digest', () => {
    const result = verifySyntheticShadowStateIntegrity(manifest(), chart());
    expect(result).toEqual({ ok: true, issues: [] });
    expect(verifySyntheticShadowStateIntegrity(manifest(), chart())).toEqual(result);
  });

  it('binds the manifest digest to a reproducible P0-B projection, not to opaque identity alone', () => {
    const sourceManifest = manifest();
    const sourceChart = chart();
    const parsed = BaziChartResult.parse(sourceChart);
    const state = projectBaziShadowState(parsed, {
      stateId: String(sourceManifest.stateId),
      resolution: sourceManifest.resolution as {
        schemaVersion: string;
        engineVersion: string;
        sourceProfileIds: string[];
      },
    });
    expect(canonicalSha256(state)).toBe(sourceManifest.stateDigest);

    const changedChart = copy(sourceChart);
    const month = (changedChart.pillars as Record<string, unknown>).month as Record<
      string,
      unknown
    >;
    const hiddenStems = month.hiddenStems as Record<string, unknown>[];
    hiddenStems[0]!.primary = false;
    expect(issueCodes(sourceManifest, changedChart)).toContain('INTEGRITY');
  });

  it('locks every chart-affecting cause to all shadow nodes and keeps narration-only causes reusable', () => {
    const sourceManifest = manifest();
    const cases = sourceManifest.invalidationCases as Array<Record<string, unknown>>;
    const allNodes = [
      'bazi.shadow.direct-roots',
      'bazi.shadow.relation-geometry',
      'bazi.shadow.strength-inputs',
      'bazi.shadow.pattern-inputs',
    ];
    for (const item of cases.slice(0, 5)) {
      expect(item.expectedInvalidatedNodeIds).toEqual(allNodes);
      expect(item.stateRecordReusable).toBe(false);
    }
    for (const item of cases.slice(5)) {
      expect(item.expectedInvalidatedNodeIds).toEqual([]);
      expect(item.stateRecordReusable).toBe(true);
    }
    expect(cases.map((item) => item.cause)).toEqual([
      'input-chart',
      'settings',
      'engine-provider',
      'ruleset',
      'source-profile',
      'topic-lens',
      'language-narrator',
    ]);
  });

  it('rejects reordered, incomplete, or semantically false invalidation cases', () => {
    const reordered = copy(manifest());
    const cases = reordered.invalidationCases as unknown[];
    [cases[0], cases[1]] = [cases[1], cases[0]];
    expect(issueCodes(reordered, chart())).toContain('INVALIDATION');

    const incomplete = copy(manifest());
    (incomplete.invalidationCases as unknown[]).pop();
    expect(issueCodes(incomplete, chart())).toContain('INVALIDATION');

    const falseReuse = copy(manifest());
    (falseReuse.invalidationCases as Record<string, unknown>[])[0]!.stateRecordReusable = true;
    expect(issueCodes(falseReuse, chart())).toContain('INVALIDATION');
  });

  it('rejects version, shape, source-profile, and synthetic-scope drift', () => {
    const badContract = copy(manifest());
    badContract.stateContractVersion = 'bazi-shadow-state/future';
    expect(issueCodes(badContract, chart())).toContain('STATE_CONTRACT');

    const profile = copy(manifest());
    (profile.resolution as Record<string, unknown>).sourceProfileIds = ['not-admitted'];
    expect(issueCodes(profile, chart())).toContain('SCOPE');

    const nonSynthetic = copy(chart());
    (nonSynthetic.provider as Record<string, unknown>).id = 'ordinary-provider';
    expect(issueCodes(manifest(), nonSynthetic)).toContain('SCOPE');
  });

  it('finds prohibited private or model fields by category and path without echoing their values', () => {
    const altered = copy(chart());
    altered.originalInput = { localDate: '2000-01-01', timezone: 'Asia/Shanghai' };
    altered.prompt = 'must never be returned';
    const result = verifySyntheticShadowStateIntegrity(manifest(), altered);
    expect(result.issues.filter((issue) => issue.code === 'PRIVACY')).toEqual([
      { code: 'PRIVACY', path: '$.chart.originalInput' },
      { code: 'PRIVACY', path: '$.chart.originalInput.localDate' },
      { code: 'PRIVACY', path: '$.chart.originalInput.timezone' },
      { code: 'PRIVACY', path: '$.chart.prompt' },
    ]);
    expect(JSON.stringify(result.issues)).not.toContain('2000-01-01');
  });

  it('keeps the manifest schema strict and its state id explicitly synthetic and opaque', () => {
    const schema = JSON.parse(
      readFileSync(
        join(root, 'evals', 'contracts', 'shadow-state-integrity-manifest.schema.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.$id).toBe('loom:eval/shadow-state-integrity-manifest/v1');
    expect(schema.required).toContain('stateDigest');
    expect(schema.required).toContain('invalidationCases');
    expect(String(JSON.stringify(schema))).toContain('opaque-synthetic-');
  });

  it('remains development-only and out of package entry points, interpretation, CLI, and Skill assets', () => {
    const read = (rel: string): string => readFileSync(join(root, rel), 'utf8');
    const tool = read('tools/eval/verify-shadow-state-integrity.ts');
    const readme = read('evals/README.md');
    expect(readme).toContain('development-only');
    expect(readme).toContain('It neither persists a state');
    for (const rel of [
      'packages/bazi-rules/src/index.ts',
      'packages/interpret/src/build.ts',
      'packages/contracts/src/index.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
    ]) {
      expect(read(rel)).not.toContain('verify-shadow-state-integrity');
    }
    for (const forbidden of ['fetch(', 'https://', 'child_process', 'openai']) {
      expect(tool).not.toContain(forbidden);
    }
  });
});
