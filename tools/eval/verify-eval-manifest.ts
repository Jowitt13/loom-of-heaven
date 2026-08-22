import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '../../packages/contracts/src/ids.ts';

/** Stable diagnostic categories for the development-only Accuracy Lab. */
export type EvalContractVerificationCode =
  'MANIFEST_SHAPE' | 'VECTOR_SHAPE' | 'LINKAGE' | 'SCOPE' | 'PRIVACY';

export interface EvalContractVerificationIssue {
  code: EvalContractVerificationCode;
  path: string;
}

export interface EvalContractVerificationResult {
  ok: boolean;
  issues: readonly EvalContractVerificationIssue[];
}

type JsonRecord = Record<string, unknown>;

const MANIFEST_KEYS = [
  'contractVersion',
  'runId',
  'mode',
  'fixtureIds',
  'engine',
  'resolution',
  'conditions',
  'repetitions',
  'conclusionVectorIds',
  'conclusionVectorDigests',
  'exclusionPolicy',
];
const VECTOR_KEYS = [
  'contractVersion',
  'vectorId',
  'fixtureId',
  'stateDigest',
  'topic',
  'lens',
  'claims',
  'limitations',
];
const CLAIM_KEYS = [
  'claimId',
  'type',
  'status',
  'stateNodeIds',
  'permittedPhrasing',
  'conditionRef',
];
const FORBIDDEN_KEYS = new Set([
  'originalinput',
  'birthinput',
  'localdate',
  'localtime',
  'timezone',
  'location',
  'latitude',
  'longitude',
  'name',
  'lifeevent',
  'prompt',
  'prompttext',
  'chainofthought',
  'transcript',
  'messages',
  'apikey',
  'providerkey',
  'rawanswer',
  'readingdraft',
]);

const TOPIC = new Set([
  'character',
  'career',
  'wealth',
  'marriage',
  'studies',
  'health',
  'general',
]);
const LENS = new Set(['overview', 'strengths', 'risks', 'timing', 'advice', 'explain']);
const CLAIM_TYPE = new Set([
  'structural-tendency',
  'tradition-qualified-interpretation',
  'timing-signal',
  'practical-option',
  'limitation',
]);
const ANSWERABILITY = new Set(['grounded', 'limited', 'not-supported']);
const PHRASING = new Set(['conditional', 'descriptive']);

const SYNTHETIC_ID = /^synthetic:[a-z0-9][a-z0-9._-]*$/;
const VECTOR_ID = /^conclusion-vector:synthetic:[a-z0-9][a-z0-9._-]*$/;
const CLAIM_ID = /^claim:synthetic:[a-z0-9][a-z0-9._-]*$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const REF = /^[a-z][a-z0-9:._@/-]+$/;
const NODE_ID = /^[a-z][a-z0-9.-]+$/;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function exactKeys(
  value: JsonRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const expected = new Set([...required, ...optional]);
  const actual = Object.keys(value);
  return (
    actual.length >= required.length &&
    required.every((key) => key in value) &&
    actual.every((key) => expected.has(key))
  );
}

function strings(value: unknown, pattern: RegExp, min = 0, max = 64): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    value.every((entry) => typeof entry === 'string' && pattern.test(entry))
  );
}

function add(
  issues: EvalContractVerificationIssue[],
  code: EvalContractVerificationCode,
  path: string,
): void {
  issues.push({ code, path });
}

function inspectForbiddenFields(
  value: unknown,
  path: string,
  issues: EvalContractVerificationIssue[],
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectForbiddenFields(entry, `${path}[${index}]`, issues));
    return;
  }
  const source = record(value);
  if (source === null) return;
  for (const [key, child] of Object.entries(source)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) add(issues, 'PRIVACY', childPath);
    inspectForbiddenFields(child, childPath, issues);
  }
}

export function canonicalSha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function verifyVector(vector: JsonRecord | null, issues: EvalContractVerificationIssue[]): void {
  if (vector === null || !exactKeys(vector, VECTOR_KEYS)) {
    add(issues, 'VECTOR_SHAPE', '$.vector');
    return;
  }
  if (vector.contractVersion !== 'conclusion-vector/v1') {
    add(issues, 'VECTOR_SHAPE', '$.vector.contractVersion');
  }
  if (typeof vector.vectorId !== 'string' || !VECTOR_ID.test(vector.vectorId)) {
    add(issues, 'VECTOR_SHAPE', '$.vector.vectorId');
  }
  if (typeof vector.fixtureId !== 'string' || !SYNTHETIC_ID.test(vector.fixtureId)) {
    add(issues, 'VECTOR_SHAPE', '$.vector.fixtureId');
  }
  if (typeof vector.stateDigest !== 'string' || !SHA256.test(vector.stateDigest)) {
    add(issues, 'VECTOR_SHAPE', '$.vector.stateDigest');
  }
  if (typeof vector.topic !== 'string' || !TOPIC.has(vector.topic)) {
    add(issues, 'VECTOR_SHAPE', '$.vector.topic');
  }
  if (typeof vector.lens !== 'string' || !LENS.has(vector.lens)) {
    add(issues, 'VECTOR_SHAPE', '$.vector.lens');
  }
  if (!strings(vector.limitations, REF, 0, 32)) add(issues, 'VECTOR_SHAPE', '$.vector.limitations');

  if (!Array.isArray(vector.claims) || vector.claims.length > 64) {
    add(issues, 'VECTOR_SHAPE', '$.vector.claims');
    return;
  }
  const ids = new Set<string>();
  vector.claims.forEach((entry, index) => {
    const claim = record(entry);
    const path = `$.vector.claims[${index}]`;
    if (claim === null || !exactKeys(claim, CLAIM_KEYS.slice(0, 5), CLAIM_KEYS.slice(5))) {
      add(issues, 'VECTOR_SHAPE', path);
      return;
    }
    if (
      typeof claim.claimId !== 'string' ||
      !CLAIM_ID.test(claim.claimId) ||
      ids.has(claim.claimId)
    ) {
      add(issues, 'VECTOR_SHAPE', `${path}.claimId`);
    } else {
      ids.add(claim.claimId);
    }
    if (typeof claim.type !== 'string' || !CLAIM_TYPE.has(claim.type))
      add(issues, 'VECTOR_SHAPE', `${path}.type`);
    if (typeof claim.status !== 'string' || !ANSWERABILITY.has(claim.status))
      add(issues, 'VECTOR_SHAPE', `${path}.status`);
    if (!strings(claim.stateNodeIds, NODE_ID, 1, 32))
      add(issues, 'VECTOR_SHAPE', `${path}.stateNodeIds`);
    if (typeof claim.permittedPhrasing !== 'string' || !PHRASING.has(claim.permittedPhrasing)) {
      add(issues, 'VECTOR_SHAPE', `${path}.permittedPhrasing`);
    }
    if (
      claim.conditionRef !== undefined &&
      (typeof claim.conditionRef !== 'string' || !REF.test(claim.conditionRef))
    ) {
      add(issues, 'VECTOR_SHAPE', `${path}.conditionRef`);
    }
  });
}

function verifyManifest(
  manifest: JsonRecord | null,
  issues: EvalContractVerificationIssue[],
): void {
  if (manifest === null || !exactKeys(manifest, MANIFEST_KEYS)) {
    add(issues, 'MANIFEST_SHAPE', '$.manifest');
    return;
  }
  if (manifest.contractVersion !== 'eval-run-manifest/v1')
    add(issues, 'MANIFEST_SHAPE', '$.manifest.contractVersion');
  if (
    typeof manifest.runId !== 'string' ||
    !/^eval:synthetic:[a-z0-9][a-z0-9._-]*$/.test(manifest.runId)
  ) {
    add(issues, 'MANIFEST_SHAPE', '$.manifest.runId');
  }
  if (manifest.mode !== 'deterministic-local-only') add(issues, 'SCOPE', '$.manifest.mode');
  if (!strings(manifest.fixtureIds, SYNTHETIC_ID, 1, 64))
    add(issues, 'MANIFEST_SHAPE', '$.manifest.fixtureIds');
  if (!strings(manifest.conclusionVectorIds, VECTOR_ID, 1, 64))
    add(issues, 'MANIFEST_SHAPE', '$.manifest.conclusionVectorIds');
  if (!strings(manifest.exclusionPolicy, REF, 1, 32))
    add(issues, 'MANIFEST_SHAPE', '$.manifest.exclusionPolicy');
  if (
    !Number.isInteger(manifest.repetitions) ||
    (manifest.repetitions as number) < 1 ||
    (manifest.repetitions as number) > 100
  ) {
    add(issues, 'MANIFEST_SHAPE', '$.manifest.repetitions');
  }

  const engine = record(manifest.engine);
  if (
    engine === null ||
    !exactKeys(engine, ['engineVersion', 'schemaVersion']) ||
    typeof engine.engineVersion !== 'string' ||
    engine.engineVersion.trim().length === 0 ||
    typeof engine.schemaVersion !== 'string' ||
    engine.schemaVersion.trim().length === 0
  ) {
    add(issues, 'MANIFEST_SHAPE', '$.manifest.engine');
  }

  const resolution = record(manifest.resolution);
  if (
    resolution === null ||
    !exactKeys(resolution, ['rulesetIds', 'sourceProfileIds']) ||
    !strings(resolution.rulesetIds, /.+/, 0, 16) ||
    !strings(resolution.sourceProfileIds, /.+/, 0, 0)
  ) {
    add(issues, 'SCOPE', '$.manifest.resolution');
  }

  const conditions = record(manifest.conditions);
  if (
    conditions === null ||
    !exactKeys(conditions, ['language', 'hostModel', 'promptTemplate']) ||
    !['zh-CN', 'en'].includes(String(conditions.language)) ||
    conditions.hostModel !== 'none' ||
    conditions.promptTemplate !== 'not-applicable'
  ) {
    add(issues, 'SCOPE', '$.manifest.conditions');
  }

  const digests = record(manifest.conclusionVectorDigests);
  if (digests === null) {
    add(issues, 'MANIFEST_SHAPE', '$.manifest.conclusionVectorDigests');
  } else if (
    Object.entries(digests).some(
      ([id, digest]) => !VECTOR_ID.test(id) || typeof digest !== 'string' || !SHA256.test(digest),
    )
  ) {
    add(issues, 'MANIFEST_SHAPE', '$.manifest.conclusionVectorDigests');
  }
}

/**
 * Validate a P0-D local manifest/vector pair without executing an engine or a host model.
 * Returned paths and categories intentionally do not echo artifact content.
 */
export function verifyEvalManifestPair(
  manifestValue: unknown,
  vectorValue: unknown,
): EvalContractVerificationResult {
  const issues: EvalContractVerificationIssue[] = [];
  const manifest = record(manifestValue);
  const vector = record(vectorValue);

  inspectForbiddenFields(manifestValue, '$.manifest', issues);
  inspectForbiddenFields(vectorValue, '$.vector', issues);
  verifyManifest(manifest, issues);
  verifyVector(vector, issues);

  if (manifest !== null && vector !== null) {
    const fixtureIds = Array.isArray(manifest.fixtureIds) ? manifest.fixtureIds : [];
    const vectorIds = Array.isArray(manifest.conclusionVectorIds)
      ? manifest.conclusionVectorIds
      : [];
    const digests = record(manifest.conclusionVectorDigests);
    if (!fixtureIds.includes(vector.fixtureId)) add(issues, 'LINKAGE', '$.manifest.fixtureIds');
    if (!vectorIds.includes(vector.vectorId))
      add(issues, 'LINKAGE', '$.manifest.conclusionVectorIds');
    if (digests?.[String(vector.vectorId)] !== canonicalSha256(vectorValue)) {
      add(issues, 'LINKAGE', '$.manifest.conclusionVectorDigests');
    }
  }

  return { ok: issues.length === 0, issues };
}

function parseArgs(args: readonly string[]): { manifest: string; vector: string } | null {
  const manifestIndex = args.indexOf('--manifest');
  const vectorIndex = args.indexOf('--vector');
  const manifest = manifestIndex >= 0 ? args[manifestIndex + 1] : undefined;
  const vector = vectorIndex >= 0 ? args[vectorIndex + 1] : undefined;
  return typeof manifest === 'string' && typeof vector === 'string' ? { manifest, vector } : null;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    process.stderr.write(
      'Usage: node tools/eval/verify-eval-manifest.ts --manifest <file> --vector <file>\n',
    );
    process.exit(2);
  }
  let manifest: unknown;
  let vector: unknown;
  try {
    manifest = JSON.parse(readFileSync(args.manifest, 'utf8'));
    vector = JSON.parse(readFileSync(args.vector, 'utf8'));
  } catch {
    process.stderr.write('[FAIL] could not read a JSON evaluation artifact.\n');
    process.exit(1);
  }
  const result = verifyEvalManifestPair(manifest, vector);
  for (const issue of result.issues) process.stdout.write(`[FAIL] ${issue.code} ${issue.path}\n`);
  if (!result.ok) process.exit(1);
  process.stdout.write(
    `[PASS] eval contracts valid: ${resolve(args.manifest)} + ${resolve(args.vector)}\n`,
  );
}

const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)) main();
