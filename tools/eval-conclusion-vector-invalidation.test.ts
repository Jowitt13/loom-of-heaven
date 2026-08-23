import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BAZI_SHADOW_STATE_NODE_IDS } from '../packages/bazi-rules/src/shadow-state.ts';
import { canonicalSha256 } from './eval/verify-eval-manifest.ts';
import { verifyConclusionVectorInvalidationMatrix } from './eval/verify-conclusion-vector-invalidation.ts';

const root = join(__dirname, '..');
const synthetic = join(root, 'evals', 'fixtures', 'synthetic');
const matrixPath = join(synthetic, 'p0f-conclusion-vector-invalidation-matrix.json');
const stateManifestPath = join(synthetic, 'p0e-shadow-state-integrity-manifest.json');
const chartPath = join(synthetic, 'p0e-bazi-shadow-chart.json');
const vectorPath = join(synthetic, 'p0d-conclusion-vector.json');
const runManifestPath = join(synthetic, 'p0d-eval-run-manifest.json');

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const copy = (value: unknown): Record<string, unknown> =>
  JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

function matrix(): Record<string, unknown> {
  return readJson(matrixPath) as Record<string, unknown>;
}

function stateManifest(): Record<string, unknown> {
  return readJson(stateManifestPath) as Record<string, unknown>;
}

function chart(): Record<string, unknown> {
  return readJson(chartPath) as Record<string, unknown>;
}

function vector(): Record<string, unknown> {
  return readJson(vectorPath) as Record<string, unknown>;
}

function runManifest(): Record<string, unknown> {
  return readJson(runManifestPath) as Record<string, unknown>;
}

function verify(
  matrixValue = matrix(),
  stateManifestValue = stateManifest(),
  chartValue = chart(),
  vectorValue = vector(),
  runManifestValue = runManifest(),
) {
  return verifyConclusionVectorInvalidationMatrix(
    matrixValue,
    stateManifestValue,
    chartValue,
    vectorValue,
    runManifestValue,
  );
}

function issueCodes(...args: Parameters<typeof verify>): string[] {
  return verify(...args).issues.map((issue) => issue.code);
}

describe('P0-F synthetic conclusion-vector invalidation matrix', () => {
  it('accepts the committed P0-D/P0-E linkage deterministically', () => {
    const result = verify();
    expect(result).toEqual({ ok: true, issues: [] });
    expect(verify()).toEqual(result);
  });

  it('binds the P0-D conclusion vector to the actual P0-E state digest and run digest', () => {
    const sourceMatrix = matrix();
    const sourceStateManifest = stateManifest();
    const sourceVector = vector();
    const sourceRunManifest = runManifest();
    const digests = sourceRunManifest.conclusionVectorDigests as Record<string, unknown>;

    expect(sourceVector.stateDigest).toBe(sourceStateManifest.stateDigest);
    expect(sourceMatrix.stateDigest).toBe(sourceStateManifest.stateDigest);
    expect(sourceMatrix.conclusionVectorDigest).toBe(canonicalSha256(sourceVector));
    expect(digests[sourceVector.vectorId as string]).toBe(sourceMatrix.conclusionVectorDigest);
  });

  it('uses only declared P0-B shadow-state node ids in every conclusion claim', () => {
    const claims = vector().claims as Array<Record<string, unknown>>;
    expect(claims).not.toHaveLength(0);
    for (const claim of claims) {
      for (const nodeId of claim.stateNodeIds as unknown[]) {
        expect(BAZI_SHADOW_STATE_NODE_IDS).toContain(nodeId);
      }
    }

    const alteredVector = copy(vector());
    ((alteredVector.claims as Array<Record<string, unknown>>)[0]!.stateNodeIds as string[]).push(
      'bazi.shadow.undeclared',
    );
    expect(issueCodes(matrix(), stateManifest(), chart(), alteredVector, runManifest())).toContain(
      'NODE_LINKAGE',
    );
  });

  it('locks the structural, topic/lens, and language/narrator reuse truth table', () => {
    const cases = matrix().invalidationCases as Array<Record<string, unknown>>;
    expect(cases.map((entry) => entry.cause)).toEqual([
      'input-chart',
      'settings',
      'engine-provider',
      'ruleset',
      'source-profile',
      'topic-lens',
      'language-narrator',
    ]);
    for (const entry of cases.slice(0, 5)) {
      expect(entry.stateRecordReusable).toBe(false);
      expect(entry.conclusionVectorReusable).toBe(false);
    }
    expect(cases[5]).toMatchObject({
      stateRecordReusable: true,
      conclusionVectorReusable: false,
    });
    expect(cases[6]).toMatchObject({
      stateRecordReusable: true,
      conclusionVectorReusable: true,
    });
  });

  it('rejects missing, reordered, and semantically false invalidation cases', () => {
    const incomplete = copy(matrix());
    (incomplete.invalidationCases as unknown[]).pop();
    expect(issueCodes(incomplete)).toContain('INVALIDATION');

    const reordered = copy(matrix());
    const cases = reordered.invalidationCases as unknown[];
    [cases[0], cases[1]] = [cases[1], cases[0]];
    expect(issueCodes(reordered)).toContain('INVALIDATION');

    const falseNarratorReuse = copy(matrix());
    (
      falseNarratorReuse.invalidationCases as Array<Record<string, unknown>>
    )[6]!.conclusionVectorReusable = false;
    expect(issueCodes(falseNarratorReuse)).toContain('INVALIDATION');
  });

  it('rejects state, vector, and run-manifest linkage drift', () => {
    const badStateMatrix = copy(matrix());
    badStateMatrix.stateDigest = `sha256:${'0'.repeat(64)}`;
    expect(issueCodes(badStateMatrix)).toContain('STATE_LINKAGE');

    const badVector = copy(vector());
    badVector.stateDigest = `sha256:${'1'.repeat(64)}`;
    expect(issueCodes(matrix(), stateManifest(), chart(), badVector, runManifest())).toContain(
      'VECTOR_LINKAGE',
    );

    const badRun = copy(runManifest());
    (badRun.conclusionVectorDigests as Record<string, unknown>)[vector().vectorId as string] =
      `sha256:${'2'.repeat(64)}`;
    expect(issueCodes(matrix(), stateManifest(), chart(), vector(), badRun)).toContain(
      'RUN_LINKAGE',
    );
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

  it('keeps the schema strict and the checker development-only and out of runtime entry points', () => {
    const schema = readJson(
      join(root, 'evals', 'contracts', 'conclusion-vector-invalidation-matrix.schema.json'),
    ) as Record<string, unknown>;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.$id).toBe('loom:eval/conclusion-vector-invalidation-matrix/v1');
    expect(schema.required).toContain('conclusionVectorDigest');
    expect(schema.required).toContain('invalidationCases');

    const read = (relative: string): string => readFileSync(join(root, relative), 'utf8');
    const tool = read('tools/eval/verify-conclusion-vector-invalidation.ts');
    const readme = read('evals/README.md');
    expect(readme).toContain('P0-F');
    expect(readme).toContain('development-only');
    for (const relative of [
      'packages/bazi-rules/src/index.ts',
      'packages/interpret/src/build.ts',
      'packages/contracts/src/index.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
    ]) {
      expect(read(relative)).not.toContain('verify-conclusion-vector-invalidation');
    }
    for (const forbidden of ['fetch(', 'https://', 'child_process', 'openai']) {
      expect(tool).not.toContain(forbidden);
    }
  });
});
