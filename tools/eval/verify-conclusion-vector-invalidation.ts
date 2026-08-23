import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAZI_SHADOW_STATE_NODE_IDS } from '../../packages/bazi-rules/src/shadow-state.ts';
import { verifyEvalManifestPair, canonicalSha256 } from './verify-eval-manifest.ts';
import { verifySyntheticShadowStateIntegrity } from './verify-shadow-state-integrity.ts';

/** Stable diagnostics for the development-only P0-F cross-contract checker. */
export type ConclusionVectorInvalidationVerificationCode =
  | 'MATRIX_SHAPE'
  | 'PRIVACY'
  | 'STATE_LINKAGE'
  | 'VECTOR_LINKAGE'
  | 'RUN_LINKAGE'
  | 'NODE_LINKAGE'
  | 'INVALIDATION';

export interface ConclusionVectorInvalidationVerificationIssue {
  code: ConclusionVectorInvalidationVerificationCode;
  path: string;
}

export interface ConclusionVectorInvalidationVerificationResult {
  ok: boolean;
  issues: readonly ConclusionVectorInvalidationVerificationIssue[];
}

type JsonRecord = Record<string, unknown>;

const MATRIX_KEYS = [
  'contractVersion',
  'fixtureId',
  'stateDigest',
  'conclusionVectorId',
  'conclusionVectorDigest',
  'invalidationCases',
  'exclusionPolicy',
];
const CASE_KEYS = ['caseId', 'cause', 'stateRecordReusable', 'conclusionVectorReusable'];
const CAUSES = [
  'input-chart',
  'settings',
  'engine-provider',
  'ruleset',
  'source-profile',
  'topic-lens',
  'language-narrator',
] as const;

type InvalidationCause = (typeof CAUSES)[number];

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
  'requestid',
  'calculatedat',
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

const SYNTHETIC_FIXTURE_ID = /^synthetic:[a-z0-9][a-z0-9._-]*$/;
const VECTOR_ID = /^conclusion-vector:synthetic:[a-z0-9][a-z0-9._-]*$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function add(
  issues: ConclusionVectorInvalidationVerificationIssue[],
  code: ConclusionVectorInvalidationVerificationCode,
  path: string,
): void {
  issues.push({ code, path });
}

function inspectForbiddenFields(
  value: unknown,
  path: string,
  issues: ConclusionVectorInvalidationVerificationIssue[],
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

function isCause(value: unknown): value is InvalidationCause {
  return typeof value === 'string' && CAUSES.includes(value as InvalidationCause);
}

function expectedVectorReusable(cause: InvalidationCause): boolean {
  // A conclusion vector has a fixed topic/lens but no narrator/language field.
  return cause === 'language-narrator';
}

/**
 * Verify P0-D/P0-E linkage and the synthetic conclusion-vector reuse table.
 * This only checks development artifacts; it does not construct prose, invoke
 * a model, persist a state, activate a rule, or expose an engine surface.
 */
export function verifyConclusionVectorInvalidationMatrix(
  matrixValue: unknown,
  stateManifestValue: unknown,
  chartValue: unknown,
  vectorValue: unknown,
  runManifestValue: unknown,
): ConclusionVectorInvalidationVerificationResult {
  const issues: ConclusionVectorInvalidationVerificationIssue[] = [];
  for (const [path, value] of [
    ['$.matrix', matrixValue],
    ['$.stateManifest', stateManifestValue],
    ['$.chart', chartValue],
    ['$.vector', vectorValue],
    ['$.runManifest', runManifestValue],
  ] as const) {
    inspectForbiddenFields(value, path, issues);
  }

  const matrix = record(matrixValue);
  const stateManifest = record(stateManifestValue);
  const vector = record(vectorValue);
  const runManifest = record(runManifestValue);
  if (matrix === null || !exactKeys(matrix, MATRIX_KEYS)) {
    add(issues, 'MATRIX_SHAPE', '$.matrix');
    return { ok: false, issues };
  }
  if (matrix.contractVersion !== 'conclusion-vector-invalidation-matrix/v1') {
    add(issues, 'MATRIX_SHAPE', '$.matrix.contractVersion');
  }
  if (typeof matrix.fixtureId !== 'string' || !SYNTHETIC_FIXTURE_ID.test(matrix.fixtureId)) {
    add(issues, 'MATRIX_SHAPE', '$.matrix.fixtureId');
  }
  if (typeof matrix.stateDigest !== 'string' || !SHA256.test(matrix.stateDigest)) {
    add(issues, 'MATRIX_SHAPE', '$.matrix.stateDigest');
  }
  if (typeof matrix.conclusionVectorId !== 'string' || !VECTOR_ID.test(matrix.conclusionVectorId)) {
    add(issues, 'MATRIX_SHAPE', '$.matrix.conclusionVectorId');
  }
  if (
    typeof matrix.conclusionVectorDigest !== 'string' ||
    !SHA256.test(matrix.conclusionVectorDigest)
  ) {
    add(issues, 'MATRIX_SHAPE', '$.matrix.conclusionVectorDigest');
  }
  if (
    !Array.isArray(matrix.exclusionPolicy) ||
    matrix.exclusionPolicy.length === 0 ||
    matrix.exclusionPolicy.some(
      (entry) => typeof entry !== 'string' || !/^[a-z][a-z0-9-]*$/.test(entry),
    )
  ) {
    add(issues, 'MATRIX_SHAPE', '$.matrix.exclusionPolicy');
  }

  if (!verifySyntheticShadowStateIntegrity(stateManifestValue, chartValue).ok) {
    add(issues, 'STATE_LINKAGE', '$.stateManifest');
  }
  if (!verifyEvalManifestPair(runManifestValue, vectorValue).ok) {
    add(issues, 'RUN_LINKAGE', '$.runManifest');
  }

  if (
    stateManifest === null ||
    stateManifest.fixtureId !== matrix.fixtureId ||
    stateManifest.stateDigest !== matrix.stateDigest
  ) {
    add(issues, 'STATE_LINKAGE', '$.matrix.stateDigest');
  }
  if (
    vector === null ||
    vector.fixtureId !== matrix.fixtureId ||
    vector.stateDigest !== matrix.stateDigest ||
    vector.vectorId !== matrix.conclusionVectorId ||
    canonicalSha256(vectorValue) !== matrix.conclusionVectorDigest
  ) {
    add(issues, 'VECTOR_LINKAGE', '$.matrix');
  }
  const runDigests = runManifest === null ? null : record(runManifest.conclusionVectorDigests);
  if (
    runManifest === null ||
    !Array.isArray(runManifest.fixtureIds) ||
    !runManifest.fixtureIds.includes(matrix.fixtureId) ||
    !Array.isArray(runManifest.conclusionVectorIds) ||
    !runManifest.conclusionVectorIds.includes(matrix.conclusionVectorId) ||
    runDigests?.[String(matrix.conclusionVectorId)] !== matrix.conclusionVectorDigest
  ) {
    add(issues, 'RUN_LINKAGE', '$.runManifest');
  }

  const claims = vector === null || !Array.isArray(vector.claims) ? [] : vector.claims;
  claims.forEach((entry, index) => {
    const claim = record(entry);
    if (
      claim === null ||
      !Array.isArray(claim.stateNodeIds) ||
      claim.stateNodeIds.some(
        (nodeId) =>
          typeof nodeId !== 'string' ||
          !BAZI_SHADOW_STATE_NODE_IDS.includes(
            nodeId as (typeof BAZI_SHADOW_STATE_NODE_IDS)[number],
          ),
      )
    ) {
      add(issues, 'NODE_LINKAGE', `$.vector.claims[${index}].stateNodeIds`);
    }
  });

  if (!Array.isArray(matrix.invalidationCases)) {
    add(issues, 'INVALIDATION', '$.matrix.invalidationCases');
  } else {
    const stateCases = Array.isArray(stateManifest?.invalidationCases)
      ? stateManifest.invalidationCases
      : [];
    if (matrix.invalidationCases.length !== CAUSES.length) {
      add(issues, 'INVALIDATION', '$.matrix.invalidationCases');
    }
    matrix.invalidationCases.forEach((entry, index) => {
      const invalidationCase = record(entry);
      const path = `$.matrix.invalidationCases[${index}]`;
      const expectedCause = CAUSES[index];
      const stateCase = record(stateCases[index]);
      if (
        invalidationCase === null ||
        !exactKeys(invalidationCase, CASE_KEYS) ||
        !isCause(invalidationCase.cause) ||
        invalidationCase.cause !== expectedCause ||
        invalidationCase.caseId !== `invalidation:synthetic:${expectedCause}`
      ) {
        add(issues, 'INVALIDATION', path);
        return;
      }
      if (
        stateCase === null ||
        stateCase.cause !== expectedCause ||
        invalidationCase.stateRecordReusable !== stateCase.stateRecordReusable
      ) {
        add(issues, 'INVALIDATION', `${path}.stateRecordReusable`);
      }
      if (invalidationCase.conclusionVectorReusable !== expectedVectorReusable(expectedCause)) {
        add(issues, 'INVALIDATION', `${path}.conclusionVectorReusable`);
      }
    });
  }

  return { ok: issues.length === 0, issues };
}

interface CliArgs {
  matrix: string;
  stateManifest: string;
  chart: string;
  vector: string;
  runManifest: string;
}

function parseArgs(args: readonly string[]): CliArgs | null {
  const option = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const matrix = option('--matrix');
  const stateManifest = option('--state-manifest');
  const chart = option('--chart');
  const vector = option('--vector');
  const runManifest = option('--run-manifest');
  if (
    typeof matrix !== 'string' ||
    typeof stateManifest !== 'string' ||
    typeof chart !== 'string' ||
    typeof vector !== 'string' ||
    typeof runManifest !== 'string'
  ) {
    return null;
  }
  return { matrix, stateManifest, chart, vector, runManifest };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    process.stderr.write(
      'Usage: node tools/eval/verify-conclusion-vector-invalidation.ts --matrix <file> --state-manifest <file> --chart <file> --vector <file> --run-manifest <file>\n',
    );
    process.exit(2);
  }
  let result: ConclusionVectorInvalidationVerificationResult;
  try {
    result = verifyConclusionVectorInvalidationMatrix(
      readJson(args.matrix),
      readJson(args.stateManifest),
      readJson(args.chart),
      readJson(args.vector),
      readJson(args.runManifest),
    );
  } catch {
    process.stderr.write('[FAIL] could not read a JSON synthetic evaluation artifact.\n');
    process.exit(1);
  }
  for (const issue of result.issues) process.stdout.write(`[FAIL] ${issue.code} ${issue.path}\n`);
  if (!result.ok) process.exit(1);
  process.stdout.write(
    `[PASS] synthetic conclusion-vector invalidation matrix valid: ${resolve(args.matrix)}\n`,
  );
}

const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)) main();
