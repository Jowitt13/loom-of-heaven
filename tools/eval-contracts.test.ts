import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalSha256, verifyEvalManifestPair } from './eval/verify-eval-manifest.ts';

const root = join(__dirname, '..');
const readJson = (relative: string): unknown =>
  JSON.parse(readFileSync(join(root, relative), 'utf8')) as unknown;
const vectorFixture = (): Record<string, unknown> =>
  structuredClone(readJson('evals/fixtures/synthetic/p0d-conclusion-vector.json')) as Record<
    string,
    unknown
  >;
const manifestFixture = (): Record<string, unknown> =>
  structuredClone(readJson('evals/fixtures/synthetic/p0d-eval-run-manifest.json')) as Record<
    string,
    unknown
  >;

describe('P0-D Accuracy Lab contracts (development-only)', () => {
  it('accepts the committed synthetic local pair and keeps results byte-identical', () => {
    const manifest = manifestFixture();
    const vector = vectorFixture();
    const first = verifyEvalManifestPair(manifest, vector);
    const second = verifyEvalManifestPair(manifest, vector);
    expect(first).toEqual({ ok: true, issues: [] });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('uses the repository canonical JSON form for the referenced vector digest', () => {
    const manifest = manifestFixture();
    const vector = vectorFixture();
    const digests = manifest.conclusionVectorDigests as Record<string, string>;
    expect(digests[vector.vectorId as string]).toBe(canonicalSha256(vector));
  });

  it('rejects contract-version, exact-shape, and artifact-linkage drift', () => {
    const manifest = manifestFixture();
    const vector = vectorFixture();
    vector.contractVersion = 'conclusion-vector/unknown';
    vector.extra = true;
    manifest.fixtureIds = ['synthetic:other'];
    expect(verifyEvalManifestPair(manifest, vector).issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['VECTOR_SHAPE', 'LINKAGE']),
    );
  });

  it('keeps P0-D local-only: no host model, prompt template, or source profile is admitted', () => {
    const manifest = manifestFixture();
    (manifest.conditions as Record<string, unknown>).hostModel = 'external-provider';
    (manifest.conditions as Record<string, unknown>).promptTemplate = 'prompt:v1';
    (manifest.resolution as Record<string, unknown>).sourceProfileIds = ['ziping-core-v1'];
    expect(verifyEvalManifestPair(manifest, vectorFixture()).issues).toEqual(
      expect.arrayContaining([
        { code: 'SCOPE', path: '$.manifest.conditions' },
        { code: 'SCOPE', path: '$.manifest.resolution' },
      ]),
    );
  });

  it('rejects private birth, location, prompt, transcript, and raw-answer fields without echoing them', () => {
    const manifest = manifestFixture();
    const vector = vectorFixture();
    vector.originalInput = { localDate: 'synthetic-only', timezone: 'synthetic-only' };
    vector.location = 'synthetic-only';
    manifest.prompt = 'synthetic-only';
    manifest.rawAnswer = 'synthetic-only';
    const result = verifyEvalManifestPair(manifest, vector);
    expect(
      result.issues.filter((issue) => issue.code === 'PRIVACY').map((issue) => issue.path),
    ).toEqual(
      expect.arrayContaining([
        '$.vector.originalInput',
        '$.vector.originalInput.localDate',
        '$.vector.originalInput.timezone',
        '$.vector.location',
        '$.manifest.prompt',
        '$.manifest.rawAnswer',
      ]),
    );
    expect(JSON.stringify(result)).not.toContain('synthetic-only');
  });

  it('rejects non-synthetic ids, unsupported claim categories, and bad node references', () => {
    const manifest = manifestFixture();
    const vector = vectorFixture();
    vector.fixtureId = 'user:record';
    const claim = (vector.claims as Record<string, unknown>[])[0]!;
    claim.type = 'fate-verdict';
    claim.stateNodeIds = ['bad reference'];
    expect(verifyEvalManifestPair(manifest, vector).issues.map((issue) => issue.code)).toContain(
      'VECTOR_SHAPE',
    );
  });

  it('keeps schemas strict and explicitly development-only', () => {
    const conclusionSchema = readFileSync(
      join(root, 'evals/contracts/conclusion-vector.schema.json'),
      'utf8',
    );
    const manifestSchema = readFileSync(
      join(root, 'evals/contracts/eval-run-manifest.schema.json'),
      'utf8',
    );
    const readme = readFileSync(join(root, 'evals/README.md'), 'utf8');
    for (const schema of [conclusionSchema, manifestSchema]) {
      expect(schema).toContain('"additionalProperties": false');
      expect(schema).toContain('"$id"');
    }
    expect(readme).toContain('development-only');
    expect(readme).toMatch(/not\*\* part of either published Skill/);
    expect(readme).toContain('not anonymization');
  });

  it('does not place an eval harness under the portable Skill or import narration/runtime code', () => {
    const tool = readFileSync(join(root, 'tools/eval/verify-eval-manifest.ts'), 'utf8');
    expect(tool).not.toContain('skills/xuan-ji-yu-heng');
    expect(tool).not.toContain('@loom/interpret');
    expect(tool).not.toContain('fetch(');
    expect(tool).not.toContain('child_process');
  });
});
