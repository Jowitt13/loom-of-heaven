import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifySyntheticShadowStateLifecycle } from './eval/verify-shadow-state-lifecycle.ts';

const root = join(__dirname, '..');
const synthetic = join(root, 'evals', 'fixtures', 'synthetic');
const matrixPath = join(synthetic, 'p2a-shadow-state-lifecycle-matrix.json');
const stateManifestPath = join(synthetic, 'p0e-shadow-state-integrity-manifest.json');
const chartPath = join(synthetic, 'p0e-bazi-shadow-chart.json');

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
const copy = (value: unknown): Record<string, unknown> =>
  JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

function matrix(): Record<string, unknown> {
  return readJson(matrixPath);
}

function stateManifest(): Record<string, unknown> {
  return readJson(stateManifestPath);
}

function chart(): Record<string, unknown> {
  return readJson(chartPath);
}

function verify(
  matrixValue = matrix(),
  stateManifestValue = stateManifest(),
  chartValue = chart(),
) {
  return verifySyntheticShadowStateLifecycle(matrixValue, stateManifestValue, chartValue);
}

function issueCodes(...args: Parameters<typeof verify>): string[] {
  return verify(...args).issues.map((issue) => issue.code);
}

describe('P2-A synthetic shadow-state lifecycle matrix', () => {
  it('accepts the committed P0-E/P1-A/P1-B/P1-C lifecycle evidence deterministically', () => {
    const result = verify();
    expect(result).toEqual({ ok: true, issues: [] });
    expect(verify()).toEqual(result);
  });

  it('covers every declared change cause plus observed structural and resolution differences', () => {
    const cases = matrix().cases as Array<Record<string, unknown>>;
    expect(cases).toHaveLength(11);
    expect(cases.map((entry) => entry.caseId)).toEqual([
      'lifecycle:synthetic:unchanged',
      'lifecycle:synthetic:input-chart',
      'lifecycle:synthetic:settings',
      'lifecycle:synthetic:engine-provider',
      'lifecycle:synthetic:ruleset',
      'lifecycle:synthetic:source-profile',
      'lifecycle:synthetic:topic-lens',
      'lifecycle:synthetic:language-narrator',
      'lifecycle:synthetic:observed-structure',
      'lifecycle:synthetic:observed-resolution',
      'lifecycle:synthetic:declared-and-observed',
    ]);
  });

  it('keeps equal state reusable only for no-change and projection-only causes', () => {
    const cases = matrix().cases as Array<Record<string, unknown>>;
    expect((cases[0]!.expected as Record<string, unknown>).stateRecordReusable).toBe(true);
    for (const lifecycleCase of cases.slice(1, 6)) {
      expect((lifecycleCase.expected as Record<string, unknown>).stateRecordReusable).toBe(false);
    }
    for (const lifecycleCase of cases.slice(6, 8)) {
      expect(lifecycleCase).toMatchObject({
        rightStateVariant: 'identical',
        expected: { stateRecordReusable: true, projectionRefreshRequired: true },
      });
    }
  });

  it('rejects malformed, reordered, duplicate, and unrecognized lifecycle cases', () => {
    const malformed = copy(matrix());
    (malformed.cases as unknown[]).pop();
    expect(issueCodes(malformed)).toContain('CASE_SET');

    const reordered = copy(matrix());
    const cases = reordered.cases as unknown[];
    [cases[0], cases[1]] = [cases[1], cases[0]];
    expect(issueCodes(reordered)).toContain('CASE_SET');

    const duplicateCause = copy(matrix());
    ((duplicateCause.cases as Array<Record<string, unknown>>)[1]!.causes as unknown[]).push(
      'input-chart',
    );
    expect(issueCodes(duplicateCause)).toContain('CASE_SET');

    const unknownVariant = copy(matrix());
    (unknownVariant.cases as Array<Record<string, unknown>>)[0]!.rightStateVariant =
      'runtime-cache';
    expect(issueCodes(unknownVariant)).toContain('CASE_SET');
  });

  it('rejects integrity linkage drift and a false decision expectation', () => {
    const wrongDigest = copy(matrix());
    wrongDigest.stateDigest = `sha256:${'0'.repeat(64)}`;
    expect(issueCodes(wrongDigest)).toContain('STATE_LINKAGE');

    const falseExpected = copy(matrix());
    (
      (falseExpected.cases as Array<Record<string, unknown>>)[8]!.expected as Record<
        string,
        unknown
      >
    ).stateRecordReusable = true;
    expect(issueCodes(falseExpected)).toContain('DECISION');
  });

  it('reports private or model fields by category and path without echoing their values', () => {
    const altered = copy(matrix());
    altered.originalInput = { localDate: '2000-01-01', timezone: 'Asia/Shanghai' };
    altered.prompt = 'must never be returned';
    const result = verify(altered);
    expect(result.issues.filter((issue) => issue.code === 'PRIVACY')).toEqual([
      { code: 'PRIVACY', path: '$.matrix.originalInput' },
      { code: 'PRIVACY', path: '$.matrix.originalInput.localDate' },
      { code: 'PRIVACY', path: '$.matrix.originalInput.timezone' },
      { code: 'PRIVACY', path: '$.matrix.prompt' },
    ]);
    expect(JSON.stringify(result.issues)).not.toContain('2000-01-01');
  });

  it('keeps the contract strict, development-only, and out of all runtime entry points', () => {
    const schema = readJson(
      join(root, 'evals', 'contracts', 'shadow-state-lifecycle-matrix.schema.json'),
    );
    expect(schema.additionalProperties).toBe(false);
    expect(schema.$id).toBe('loom:eval/shadow-state-lifecycle-matrix/v1');
    expect(schema.required).toEqual([
      'contractVersion',
      'fixtureId',
      'mode',
      'stateContractVersion',
      'stateDigest',
      'cases',
      'exclusionPolicy',
    ]);

    const read = (relative: string): string => readFileSync(join(root, relative), 'utf8');
    const tool = read('tools/eval/verify-shadow-state-lifecycle.ts');
    const readme = read('evals/README.md');
    expect(readme).toContain('P2-A');
    expect(readme).toContain('development-only');
    for (const relative of [
      'packages/bazi-rules/src/index.ts',
      'packages/interpret/src/build.ts',
      'packages/contracts/src/index.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
    ]) {
      expect(read(relative)).not.toContain('verify-shadow-state-lifecycle');
    }
    for (const forbidden of ['fetch(', 'https://', 'child_process', 'openai']) {
      expect(tool).not.toContain(forbidden);
    }
  });
});
