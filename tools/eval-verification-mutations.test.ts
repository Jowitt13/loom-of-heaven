import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  VERIFICATION_MUTATION_SPECS,
  verifySyntheticVerificationMutations,
  type VerificationMutationInputs,
} from './eval/verify-verification-mutations.ts';

const root = join(__dirname, '..');
const synthetic = join(root, 'evals', 'fixtures', 'synthetic');
const catalogPath = join(synthetic, 'p2b-verification-mutation-matrix.json');

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
const copy = (value: unknown): Record<string, unknown> =>
  JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

function catalog(): Record<string, unknown> {
  return readJson(catalogPath);
}

function inputs(): VerificationMutationInputs {
  return {
    chart: readJson(join(synthetic, 'p0e-bazi-shadow-chart.json')),
    stateManifest: readJson(join(synthetic, 'p0e-shadow-state-integrity-manifest.json')),
    conclusionVector: readJson(join(synthetic, 'p0d-conclusion-vector.json')),
    runManifest: readJson(join(synthetic, 'p0d-eval-run-manifest.json')),
    conclusionInvalidationMatrix: readJson(
      join(synthetic, 'p0f-conclusion-vector-invalidation-matrix.json'),
    ),
    lifecycleMatrix: readJson(join(synthetic, 'p2a-shadow-state-lifecycle-matrix.json')),
  };
}

describe('P2-B synthetic verifier mutation gate', () => {
  it('detects every committed fixed mutation deterministically', () => {
    const result = verifySyntheticVerificationMutations(catalog(), inputs());
    expect(result).toEqual({
      ok: true,
      detectedCaseIds: VERIFICATION_MUTATION_SPECS.map(
        ([, mutation]) => `mutation:synthetic:${mutation}`,
      ),
      issues: [],
    });
    expect(verifySyntheticVerificationMutations(catalog(), inputs())).toEqual(result);
  });

  it('locks the target and mutation order to the implementation-owned catalog', () => {
    const cases = catalog().cases as Array<Record<string, unknown>>;
    expect(cases).toHaveLength(25);
    expect(cases.map((entry) => [entry.target, entry.mutation])).toEqual(
      VERIFICATION_MUTATION_SPECS,
    );
    expect(new Set(cases.map((entry) => entry.mutation)).size).toBe(cases.length);
  });

  it('rejects reordered, incomplete, or duplicated catalog entries before injection', () => {
    const reordered = copy(catalog());
    const reorderedCases = reordered.cases as unknown[];
    [reorderedCases[0], reorderedCases[1]] = [reorderedCases[1], reorderedCases[0]];
    expect(verifySyntheticVerificationMutations(reordered, inputs()).issues).toContainEqual({
      code: 'MUTATION_SET',
      path: '$.catalog.cases[0].caseId',
    });

    const incomplete = copy(catalog());
    (incomplete.cases as unknown[]).pop();
    expect(verifySyntheticVerificationMutations(incomplete, inputs()).issues).toContainEqual({
      code: 'MUTATION_SET',
      path: '$.catalog.cases',
    });

    const duplicated = copy(catalog());
    const cases = duplicated.cases as Array<Record<string, unknown>>;
    cases[1]!.mutation = cases[0]!.mutation;
    expect(verifySyntheticVerificationMutations(duplicated, inputs()).issues).toContainEqual({
      code: 'MUTATION_SET',
      path: '$.catalog.cases[1].mutation',
    });
  });

  it('rejects a baseline digest drift before reporting mutation success', () => {
    const altered = copy(catalog());
    (altered.baselineDigests as Record<string, unknown>).chart = `sha256:${'f'.repeat(64)}`;
    const result = verifySyntheticVerificationMutations(altered, inputs());
    expect(result.detectedCaseIds).toEqual([]);
    expect(result.issues).toContainEqual({
      code: 'LINKAGE',
      path: '$.catalog.baselineDigests.chart',
    });
  });

  it('rejects a semantically false expected diagnostic', () => {
    const altered = copy(catalog());
    const first = (altered.cases as Array<Record<string, unknown>>)[0]!;
    first.expectedIssues = [{ code: 'NODE_SET', path: '$.nodes[9].id' }];
    const result = verifySyntheticVerificationMutations(altered, inputs());
    expect(result.detectedCaseIds).not.toContain(first.caseId);
    expect(result.issues).toContainEqual({
      code: 'DETECTION',
      path: '$.catalog.cases[0].expectedIssues',
    });
  });

  it('reports prohibited fields by path without echoing their values', () => {
    const altered = copy(catalog());
    altered.prompt = 'must never be returned';
    altered.originalInput = { localDate: '2000-01-01' };
    const result = verifySyntheticVerificationMutations(altered, inputs());
    expect(result.issues.filter((issue) => issue.code === 'PRIVACY')).toEqual([
      { code: 'PRIVACY', path: '$.catalog.prompt' },
      { code: 'PRIVACY', path: '$.catalog.originalInput' },
      { code: 'PRIVACY', path: '$.catalog.originalInput.localDate' },
    ]);
    expect(JSON.stringify(result.issues)).not.toContain('2000-01-01');
    expect(JSON.stringify(result.issues)).not.toContain('must never be returned');
  });

  it('keeps the JSON contract strict and limited to code/path diagnostics', () => {
    const schema = readJson(
      join(root, 'evals', 'contracts', 'verification-mutation-matrix.schema.json'),
    );
    expect(schema.$id).toBe('loom:eval/verification-mutation-matrix/v1');
    expect(schema.additionalProperties).toBe(false);
    const cases = ((schema.properties as Record<string, unknown>).cases as Record<string, unknown>)
      .items as Record<string, unknown>;
    expect(cases.additionalProperties).toBe(false);
    expect(cases.required).toEqual(['caseId', 'target', 'mutation', 'expectedIssues']);
    expect(JSON.stringify(schema)).not.toContain('mutationValue');
    expect(JSON.stringify(schema)).not.toContain('jsonPath');
  });

  it('remains development-only and absent from runtime, public contracts, and Skill assets', () => {
    const read = (relative: string): string => readFileSync(join(root, relative), 'utf8');
    const tool = read('tools/eval/verify-verification-mutations.ts');
    const readme = read('evals/README.md');
    expect(readme).toContain('P2-B');
    expect(readme).toContain('fault-detection regression gate');
    for (const relative of [
      'packages/bazi-rules/src/index.ts',
      'packages/interpret/src/build.ts',
      'packages/contracts/src/index.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
    ]) {
      expect(read(relative)).not.toContain('verify-verification-mutations');
    }
    for (const forbidden of ['fetch(', 'https://', 'child_process', 'openai']) {
      expect(tool).not.toContain(forbidden);
    }
  });
});
