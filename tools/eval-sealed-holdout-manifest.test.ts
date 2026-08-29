import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readCommittedSealedHoldoutManifest,
  verifySealedHoldoutManifest,
  type SealedHoldoutManifestInputs,
} from './eval/verify-sealed-holdout-manifest.ts';

const root = join(__dirname, '..');
const EMPTY_SHA256 = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function manifestInputs(): SealedHoldoutManifestInputs {
  const committed = readCommittedSealedHoldoutManifest();
  return { manifest: copy(committed.manifest), schema: copy(committed.schema) };
}

function verify(inputs: SealedHoldoutManifestInputs = manifestInputs()) {
  return verifySealedHoldoutManifest(inputs);
}

function issueCodes(result: ReturnType<typeof verify>): string[] {
  return result.issues.map((issue) => issue.code);
}

describe('IQ-0C1 planned sealed holdout manifest', () => {
  it('accepts only the committed pre-activation metadata and repeats deterministically', () => {
    const result = verify();
    expect(result).toEqual({ ok: true, status: 'planned', caseCount: 0, issues: [] });
    expect(verify()).toEqual(result);
  });

  it('locks the empty-content and empty-access-log sentinel before activation', () => {
    const manifest = manifestInputs().manifest as Record<string, unknown>;
    expect(manifest.contentDigest).toBe(EMPTY_SHA256);
    expect(manifest.accessLogDigest).toBe(EMPTY_SHA256);

    manifest.contentDigest = `sha256:${'a'.repeat(64)}`;
    expect(issueCodes(verify({ manifest, schema: manifestInputs().schema }))).toContain(
      'DIGEST_BOUNDARY',
    );
  });

  it('rejects activation, content count, retirement count and replacement claims in the planned state', () => {
    for (const [key, value] of [
      ['status', 'active'],
      ['caseCount', 1],
      ['retiredCaseCount', 1],
      ['replacementRequired', true],
    ] as const) {
      const inputs = manifestInputs();
      (inputs.manifest as Record<string, unknown>)[key] = value;
      expect(issueCodes(verify(inputs)), key).toContain('PLANNED_STATE');
    }
  });

  it('rejects holdout content, review material, raw data and runtime references', () => {
    const privacy = manifestInputs();
    (privacy.manifest as Record<string, unknown>).holdoutInput = 'forbidden';
    expect(issueCodes(verify(privacy))).toEqual(
      expect.arrayContaining(['MANIFEST_SHAPE', 'PRIVACY']),
    );

    const runtime = manifestInputs();
    (runtime.manifest as Record<string, unknown>).custodianRole = 'skills/runtime-custodian';
    expect(issueCodes(verify(runtime))).toContain('RUNTIME_BOUNDARY');
  });

  it('locks the metadata-only contract, digest grammar and lifecycle vocabulary', () => {
    const inputs = manifestInputs();
    const schema = inputs.schema as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    properties.status.enum = ['planned', 'active'];
    properties.contentDigest.pattern = '.*';
    expect(issueCodes(verify(inputs))).toEqual(
      expect.arrayContaining(['LIFECYCLE_BOUNDARY', 'DIGEST_BOUNDARY']),
    );
  });

  it('documents the pre-activation boundary and controlled-storage protocol', () => {
    const doc = readFileSync(join(root, 'docs', 'ANSWER_QUALITY_EVALUATION.md'), 'utf8');
    expect(doc).toContain('IQ-0C1 planned sealed-holdout manifest');
    expect(doc).toContain('not an active holdout');
    expect(doc).toContain('controlled storage');
    expect(doc).toContain('retired into the public regression corpus');
  });

  it('keeps sealed-holdout machinery out of runtime and external-service paths', () => {
    const runtimeEntrypoints = [
      'packages/bazi-rules/src/index.ts',
      'packages/interpret/src/build.ts',
      'packages/contracts/src/index.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
      'package.json',
    ];
    for (const path of runtimeEntrypoints) {
      expect(readFileSync(join(root, path), 'utf8'), path).not.toContain(
        'verify-sealed-holdout-manifest',
      );
    }
    const verifier = readFileSync(
      join(root, 'tools/eval/verify-sealed-holdout-manifest.ts'),
      'utf8',
    );
    for (const forbidden of ['fetch(', 'https://', 'child_process', 'openai']) {
      expect(verifier).not.toContain(forbidden);
    }
  });
});
