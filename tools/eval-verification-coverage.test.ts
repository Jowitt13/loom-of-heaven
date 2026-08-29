import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  VERIFICATION_COVERAGE_GAP_REGISTRY,
  VERIFICATION_COVERAGE_RISK_SPECS,
  verifySyntheticVerificationCoverage,
} from './eval/verify-verification-coverage.ts';
import { verifySyntheticVerificationMutations } from './eval/verify-verification-mutations.ts';
import type { VerificationMutationInputs } from './eval/verify-verification-mutations.ts';
import { canonicalSha256 } from './eval/verify-eval-manifest.ts';

const root = join(__dirname, '..');
const synthetic = join(root, 'evals', 'fixtures', 'synthetic');
const matrixPath = join(synthetic, 'p2c-verification-coverage-matrix.json');

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
const copy = (value: unknown): Record<string, unknown> =>
  JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

const dotDot = `${'.'}${'.'}`;

function matrix(): Record<string, unknown> {
  return readJson(matrixPath);
}

function catalog(): Record<string, unknown> {
  return readJson(join(synthetic, 'p2b-verification-mutation-matrix.json'));
}

function mutationInputs(): VerificationMutationInputs {
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

function verify(
  matrixValue: Record<string, unknown> = matrix(),
  catalogValue: Record<string, unknown> = catalog(),
  inputs: VerificationMutationInputs = mutationInputs(),
) {
  return verifySyntheticVerificationCoverage(matrixValue, catalogValue, inputs);
}

function issuesWithCode(result: ReturnType<typeof verify>, code: string) {
  return result.issues.filter((issue) => issue.code === code);
}

describe('P2-C synthetic verification coverage matrix', () => {
  it('accepts the committed coverage matrix and repeats byte-identically', () => {
    const result = verify();
    expect(result).toEqual({
      ok: true,
      riskRowsVerified: 8,
      detectedMutations: 25,
      issues: [],
    });
    expect(verify()).toEqual(result);
  });

  it('locks the eight risk rows to the implementation-owned fixed set and order', () => {
    const rows = matrix().rows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(VERIFICATION_COVERAGE_RISK_SPECS.length);
    expect(rows.map((row) => row.riskId)).toEqual(
      VERIFICATION_COVERAGE_RISK_SPECS.map((spec) => spec.riskId),
    );
    expect(new Set(rows.map((row) => row.riskId)).size).toBe(rows.length);
    const expectedRows = VERIFICATION_COVERAGE_RISK_SPECS.map((spec) => ({
      riskId: spec.riskId,
      layer: spec.layer,
      coverageStatus: spec.expectedStatus,
      verifierBindings: [...spec.requiredVerifierBindings],
      positiveTestBindings: [...spec.requiredPositiveTestBindings],
      negativeBindings: [...spec.requiredNegativeBindings],
      gapIds: [...spec.expectedGapIds],
    }));
    expect(rows).toEqual(expectedRows);
  });

  it('binds the real P2-B catalog digest and re-runs the mutation gate for real', () => {
    expect(matrix().mutationCatalogDigest).toBe(canonicalSha256(catalog()));
    const gate = verifySyntheticVerificationMutations(catalog(), mutationInputs());
    expect(gate.ok).toBe(true);
    expect(gate.detectedCaseIds).toHaveLength(25);
    expect(verify().detectedMutations).toBe(25);
  });

  it('records covered and partially-covered risks together with only stable gap ids', () => {
    const rows = matrix().rows as Array<Record<string, unknown>>;
    const statuses = rows.map((row) => row.coverageStatus);
    expect(statuses).toContain('covered');
    expect(statuses).toContain('partially-covered');
    expect(statuses.filter((status) => status === 'partially-covered')).toHaveLength(2);
    const gaps = rows.flatMap((row) => row.gapIds as string[]);
    expect([...gaps].sort()).toEqual([
      'collector-algorithm-mutation-not-covered',
      'p0d-contract-no-dedicated-mutation',
    ]);
    expect(Object.keys(VERIFICATION_COVERAGE_GAP_REGISTRY)).toHaveLength(2);
  });

  it('keeps the coverage contract strict and free of accuracy metrics', () => {
    const schema = readJson(
      join(root, 'evals', 'contracts', 'verification-coverage-matrix.schema.json'),
    );
    expect(schema.$id).toBe('loom:eval/verification-coverage-matrix/v1');
    expect(schema.additionalProperties).toBe(false);
    const rows = ((schema.properties as Record<string, unknown>).rows as Record<string, unknown>)
      .items as Record<string, unknown>;
    expect(rows.additionalProperties).toBe(false);
    expect(JSON.stringify(schema)).not.toContain('percentage');
    expect(JSON.stringify(schema)).not.toContain('percent');
    expect(JSON.stringify(schema)).not.toContain('score');
    expect(JSON.stringify(schema)).not.toContain('accuracyRate');
    expect(JSON.stringify(schema)).not.toContain('jsonPath');
    expect(JSON.stringify(schema)).not.toContain('mutationValue');
    const schemaText = JSON.stringify(schema);
    for (const gapId of Object.keys(VERIFICATION_COVERAGE_GAP_REGISTRY)) {
      expect(schemaText).toContain(gapId);
    }
  });

  it('rejects deleted, reordered, or duplicated risk rows', () => {
    const incomplete = copy(matrix());
    (incomplete.rows as unknown[]).pop();
    expect(verify(incomplete).issues).toContainEqual({ code: 'RISK_SET', path: '$.matrix.rows' });

    const reordered = copy(matrix());
    const reorderedRows = reordered.rows as unknown[];
    [reorderedRows[0], reorderedRows[1]] = [reorderedRows[1], reorderedRows[0]];
    expect(verify(reordered).issues).toContainEqual({
      code: 'RISK_SET',
      path: '$.matrix.rows[0].riskId',
    });

    const duplicated = copy(matrix());
    const rows = duplicated.rows as Array<Record<string, unknown>>;
    rows[1] = JSON.parse(JSON.stringify(rows[0])) as Record<string, unknown>;
    expect(verify(duplicated).issues).toContainEqual({
      code: 'RISK_SET',
      path: '$.matrix.rows[1].riskId',
    });
  });

  it('rejects a coverage status that departs from the implementation-owned spec', () => {
    const altered = copy(matrix());
    (altered.rows as Array<Record<string, unknown>>)[2]!.coverageStatus = 'blocked';
    const result = verify(altered);
    expect(issuesWithCode(result, 'STATUS_CONSISTENCY')).toContainEqual({
      code: 'STATUS_CONSISTENCY',
      path: '$.matrix.rows[2].coverageStatus',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects gap id drift against the fixed gap registry', () => {
    const removed = copy(matrix());
    (removed.rows as Array<Record<string, unknown>>)[0]!.gapIds = [];
    expect(verify(removed).issues).toContainEqual({
      code: 'STATUS_CONSISTENCY',
      path: '$.matrix.rows[0].gapIds',
    });

    const added = copy(matrix());
    const privacyRow = (added.rows as Array<Record<string, unknown>>)[1]!;
    privacyRow.gapIds = [...(privacyRow.gapIds as string[]), 'p0d-contract-no-dedicated-mutation'];
    expect(verify(added).issues).toContainEqual({
      code: 'STATUS_CONSISTENCY',
      path: '$.matrix.rows[1].gapIds',
    });

    const unknown = copy(matrix());
    (unknown.rows as Array<Record<string, unknown>>)[1]!.gapIds = ['invented-free-text-gap'];
    expect(verify(unknown).issues).toContainEqual({
      code: 'COVERAGE_SHAPE',
      path: '$.matrix.rows[1].gapIds',
    });
  });

  it('fails closed with BINDING when a bound export, title, or case id does not exist', () => {
    const wrongExport = copy(matrix());
    (
      (wrongExport.rows as Array<Record<string, unknown>>)[0]!.verifierBindings as Array<
        Record<string, unknown>
      >
    )[0]!.exportName = 'verifyBaziShadowStateTypo';
    expect(verify(wrongExport).issues).toContainEqual({
      code: 'BINDING',
      path: '$.matrix.rows[0].verifierBindings[0].exportName',
    });

    const wrongTitle = copy(matrix());
    (
      (wrongTitle.rows as Array<Record<string, unknown>>)[0]!.positiveTestBindings as Array<
        Record<string, unknown>
      >
    )[0]!.testTitle = 'this test title does not exist';
    expect(verify(wrongTitle).issues).toContainEqual({
      code: 'BINDING',
      path: '$.matrix.rows[0].positiveTestBindings[0].testTitle',
    });

    const wrongCase = copy(matrix());
    (
      (wrongCase.rows as Array<Record<string, unknown>>)[0]!.negativeBindings as Array<
        Record<string, unknown>
      >
    )[0]!.caseId = 'mutation:synthetic:never-declared-mutation';
    expect(verify(wrongCase).issues).toContainEqual({
      code: 'BINDING',
      path: '$.matrix.rows[0].negativeBindings[0].caseId',
    });

    const wrongNegativeTitle = copy(matrix());
    (
      (wrongNegativeTitle.rows as Array<Record<string, unknown>>)[7]!.negativeBindings as Array<
        Record<string, unknown>
      >
    )[0]!.testTitle = 'this negative test title does not exist';
    expect(verify(wrongNegativeTitle).issues).toContainEqual({
      code: 'BINDING',
      path: '$.matrix.rows[7].negativeBindings[0].testTitle',
    });
  });

  it('rejects catalog digest drift and a drifted P2-B baseline artifact', () => {
    const wrongDigest = copy(matrix());
    wrongDigest.mutationCatalogDigest = `sha256:${'0'.repeat(64)}`;
    expect(verify(wrongDigest).issues).toContainEqual({
      code: 'CATALOG_LINKAGE',
      path: '$.matrix.mutationCatalogDigest',
    });

    const driftedChart = { provider: { id: 'ordinary-provider' } };
    const inputs = mutationInputs();
    const result = verify(matrix(), catalog(), { ...inputs, chart: driftedChart });
    expect(result.ok).toBe(false);
    expect(result.detectedMutations).toBe(0);
    expect(issuesWithCode(result, 'CATALOG_LINKAGE')[0]).toMatchObject({
      code: 'CATALOG_LINKAGE',
      path: '$.mutationGate.issues[0]',
    });
  });

  it('reports prohibited private or model fields by path without echoing their values', () => {
    const altered = copy(matrix());
    altered.originalInput = { localDate: '2000-01-01' };
    altered.prompt = 'must never be returned';
    const result = verify(altered);
    expect(issuesWithCode(result, 'PRIVACY')).toEqual([
      { code: 'PRIVACY', path: '$.matrix.originalInput' },
      { code: 'PRIVACY', path: '$.matrix.originalInput.localDate' },
      { code: 'PRIVACY', path: '$.matrix.prompt' },
    ]);
    expect(JSON.stringify(result.issues)).not.toContain('2000-01-01');
    expect(JSON.stringify(result.issues)).not.toContain('must never be returned');
  });

  it('rejects binding paths that escape the repository or touch forbidden trees', () => {
    const traversal = copy(matrix());
    (
      (traversal.rows as Array<Record<string, unknown>>)[0]!.verifierBindings as Array<
        Record<string, unknown>
      >
    )[0]!.file = `${dotDot}/pnpm-lock.yaml`;
    expect(verify(traversal).issues).toContainEqual({
      code: 'RUNTIME_BOUNDARY',
      path: '$.matrix.rows[0].verifierBindings[0].file',
    });

    const skill = copy(matrix());
    (
      (skill.rows as Array<Record<string, unknown>>)[0]!.verifierBindings as Array<
        Record<string, unknown>
      >
    )[0]!.file = 'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs';
    expect(verify(skill).issues).toContainEqual({
      code: 'RUNTIME_BOUNDARY',
      path: '$.matrix.rows[0].verifierBindings[0].file',
    });

    const dependency = copy(matrix());
    (
      (dependency.rows as Array<Record<string, unknown>>)[0]!.verifierBindings as Array<
        Record<string, unknown>
      >
    )[0]!.file = 'packages/bazi-rules/node_modules/x.ts';
    expect(verify(dependency).issues).toContainEqual({
      code: 'RUNTIME_BOUNDARY',
      path: '$.matrix.rows[0].verifierBindings[0].file',
    });
  });

  it('keeps P2-C out of runtime entry points and the verifier free of runtime capabilities', () => {
    const read = (relative: string): string => readFileSync(join(root, relative), 'utf8');
    const tool = read('tools/eval/verify-verification-coverage.ts');
    for (const relative of [
      'packages/bazi-rules/src/index.ts',
      'packages/interpret/src/build.ts',
      'packages/contracts/src/index.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
    ]) {
      expect(read(relative)).not.toContain('verify-verification-coverage');
    }
    for (const forbidden of ['fetch(', 'http://', 'https://', 'child_process', 'openai']) {
      expect(tool).not.toContain(forbidden);
    }
  });

  it('documents the P2-C boundary as coverage traceability, not an accuracy report', () => {
    const readme = readFileSync(join(root, 'evals', 'README.md'), 'utf8');
    expect(readme).toContain('P2-C');
    expect(readme).toContain('development-only');
    expect(readme).toContain('p0d-contract-no-dedicated-mutation');
    expect(readme).toContain('collector-algorithm-mutation-not-covered');
    expect(readme).toContain('verify-verification-coverage.ts');
    expect(readme.toLowerCase()).toContain('accuracy percentage');
  });
});
