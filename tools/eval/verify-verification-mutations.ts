import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BaziChartResult, canonicalJson } from '../../packages/contracts/src/index.ts';
import { projectBaziShadowState } from '../../packages/bazi-rules/src/shadow-state.ts';
import { verifyBaziShadowState } from '../../packages/bazi-rules/src/shadow-state-verify.ts';
import { verifyConclusionVectorInvalidationMatrix } from './verify-conclusion-vector-invalidation.ts';
import { canonicalSha256 } from './verify-eval-manifest.ts';
import { verifySyntheticShadowStateIntegrity } from './verify-shadow-state-integrity.ts';
import { verifySyntheticShadowStateLifecycle } from './verify-shadow-state-lifecycle.ts';

export type VerificationMutationTarget =
  | 'shadow-state-contract'
  | 'shadow-state-integrity'
  | 'conclusion-vector-invalidation'
  | 'shadow-state-lifecycle';

export const VERIFICATION_MUTATION_SPECS = [
  ['shadow-state-contract', 'state-node-order-swapped'],
  ['shadow-state-contract', 'state-dependency-dropped'],
  ['shadow-state-contract', 'state-invalidation-dropped'],
  ['shadow-state-contract', 'state-collector-link-drift'],
  ['shadow-state-contract', 'state-forbidden-field'],
  ['shadow-state-integrity', 'integrity-digest-drift'],
  ['shadow-state-integrity', 'integrity-contract-version-drift'],
  ['shadow-state-integrity', 'integrity-state-contract-drift'],
  ['shadow-state-integrity', 'integrity-source-profile-added'],
  ['shadow-state-integrity', 'integrity-chart-scope-drift'],
  ['shadow-state-integrity', 'integrity-chart-structure-drift'],
  ['shadow-state-integrity', 'integrity-forbidden-field'],
  ['conclusion-vector-invalidation', 'vector-state-linkage-drift'],
  ['conclusion-vector-invalidation', 'run-vector-digest-drift'],
  ['conclusion-vector-invalidation', 'vector-node-linkage-drift'],
  ['conclusion-vector-invalidation', 'conclusion-case-reordered'],
  ['conclusion-vector-invalidation', 'conclusion-topic-reuse-flipped'],
  ['conclusion-vector-invalidation', 'conclusion-forbidden-field'],
  ['shadow-state-lifecycle', 'lifecycle-state-linkage-drift'],
  ['shadow-state-lifecycle', 'lifecycle-case-missing'],
  ['shadow-state-lifecycle', 'lifecycle-case-reordered'],
  ['shadow-state-lifecycle', 'lifecycle-duplicate-cause'],
  ['shadow-state-lifecycle', 'lifecycle-variant-unknown'],
  ['shadow-state-lifecycle', 'lifecycle-decision-flipped'],
  ['shadow-state-lifecycle', 'lifecycle-cause-omitted'],
] as const satisfies readonly (readonly [VerificationMutationTarget, string])[];

export type VerificationMutationName = (typeof VERIFICATION_MUTATION_SPECS)[number][1];

export interface VerificationMutationObservedIssue {
  code: string;
  path: string;
}

export type VerificationMutationVerificationCode =
  'CATALOG_SHAPE' | 'PRIVACY' | 'BASELINE' | 'LINKAGE' | 'MUTATION_SET' | 'DETECTION';

export interface VerificationMutationVerificationIssue {
  code: VerificationMutationVerificationCode;
  path: string;
}

export interface VerificationMutationVerificationResult {
  ok: boolean;
  detectedCaseIds: readonly string[];
  issues: readonly VerificationMutationVerificationIssue[];
}

export interface VerificationMutationInputs {
  chart: unknown;
  stateManifest: unknown;
  conclusionVector: unknown;
  runManifest: unknown;
  conclusionInvalidationMatrix: unknown;
  lifecycleMatrix: unknown;
}

type JsonRecord = Record<string, unknown>;

const CATALOG_KEYS = [
  'contractVersion',
  'suiteId',
  'fixtureId',
  'mode',
  'baselineDigests',
  'cases',
  'exclusionPolicy',
];
const DIGEST_KEYS = [
  'chart',
  'stateManifest',
  'conclusionVector',
  'runManifest',
  'conclusionInvalidationMatrix',
  'lifecycleMatrix',
];
const CASE_KEYS = ['caseId', 'target', 'mutation', 'expectedIssues'];
const EXPECTED_ISSUE_KEYS = ['code', 'path'];
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const SYNTHETIC_ID = /^synthetic:[a-z0-9][a-z0-9._-]*$/;
const SUITE_ID = /^mutation-suite:synthetic:[a-z0-9][a-z0-9._-]*$/;
const CASE_ID = /^mutation:synthetic:[a-z0-9][a-z0-9._-]*$/;
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

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
  issues: VerificationMutationVerificationIssue[],
  code: VerificationMutationVerificationCode,
  path: string,
): void {
  issues.push({ code, path });
}

function inspectForbiddenFields(
  value: unknown,
  path: string,
  issues: VerificationMutationVerificationIssue[],
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

function projectBaselineState(inputs: VerificationMutationInputs): JsonRecord | null {
  const chart = BaziChartResult.safeParse(inputs.chart);
  const manifest = record(inputs.stateManifest);
  const resolution = record(manifest?.resolution);
  if (
    !chart.success ||
    manifest === null ||
    resolution === null ||
    typeof manifest.stateId !== 'string' ||
    typeof resolution.schemaVersion !== 'string' ||
    typeof resolution.engineVersion !== 'string'
  ) {
    return null;
  }
  return copy(
    projectBaziShadowState(chart.data, {
      stateId: manifest.stateId,
      resolution: {
        schemaVersion: resolution.schemaVersion,
        engineVersion: resolution.engineVersion,
        sourceProfileIds: [],
      },
    }),
  ) as unknown as JsonRecord;
}

function arrayAt(source: JsonRecord, key: string): unknown[] {
  const value = source[key];
  if (!Array.isArray(value)) throw new Error(`invalid baseline array: ${key}`);
  return value;
}

function objectAt(source: JsonRecord, key: string): JsonRecord {
  const value = record(source[key]);
  if (value === null) throw new Error(`invalid baseline object: ${key}`);
  return value;
}

function observeStateMutation(
  mutation: VerificationMutationName,
  baselineState: JsonRecord,
): readonly VerificationMutationObservedIssue[] {
  const state = copy(baselineState);
  const nodes = arrayAt(state, 'nodes') as JsonRecord[];
  switch (mutation) {
    case 'state-node-order-swapped':
      [nodes[0], nodes[1]] = [nodes[1]!, nodes[0]!];
      break;
    case 'state-dependency-dropped':
      nodes[0]!.dependsOn = [];
      break;
    case 'state-invalidation-dropped':
      (nodes[0]!.invalidatedBy as unknown[]).pop();
      break;
    case 'state-collector-link-drift':
      objectAt(nodes[2]!, 'value').directRoots = {};
      break;
    case 'state-forbidden-field':
      state.prompt = 'synthetic-private-value';
      break;
    default:
      throw new Error(`mutation target mismatch: ${mutation}`);
  }
  return verifyBaziShadowState(state).issues;
}

function observeIntegrityMutation(
  mutation: VerificationMutationName,
  inputs: VerificationMutationInputs,
): readonly VerificationMutationObservedIssue[] {
  const manifest = copy(inputs.stateManifest) as JsonRecord;
  const chart = copy(inputs.chart) as JsonRecord;
  switch (mutation) {
    case 'integrity-digest-drift':
      manifest.stateDigest = `sha256:${'0'.repeat(64)}`;
      break;
    case 'integrity-contract-version-drift':
      manifest.contractVersion = 'shadow-state-integrity-manifest/future';
      break;
    case 'integrity-state-contract-drift':
      manifest.stateContractVersion = 'bazi-shadow-state/future';
      break;
    case 'integrity-source-profile-added':
      objectAt(manifest, 'resolution').sourceProfileIds = ['not-admitted'];
      break;
    case 'integrity-chart-scope-drift':
      objectAt(chart, 'provider').id = 'ordinary-provider';
      break;
    case 'integrity-chart-structure-drift':
      delete chart.dayBoundaryApplied;
      break;
    case 'integrity-forbidden-field':
      manifest.prompt = 'synthetic-private-value';
      break;
    default:
      throw new Error(`mutation target mismatch: ${mutation}`);
  }
  return verifySyntheticShadowStateIntegrity(manifest, chart).issues;
}

function observeConclusionMutation(
  mutation: VerificationMutationName,
  inputs: VerificationMutationInputs,
): readonly VerificationMutationObservedIssue[] {
  const matrix = copy(inputs.conclusionInvalidationMatrix) as JsonRecord;
  const stateManifest = copy(inputs.stateManifest);
  const chart = copy(inputs.chart);
  const vector = copy(inputs.conclusionVector) as JsonRecord;
  const runManifest = copy(inputs.runManifest) as JsonRecord;
  switch (mutation) {
    case 'vector-state-linkage-drift': {
      vector.stateDigest = `sha256:${'1'.repeat(64)}`;
      const digest = canonicalSha256(vector);
      matrix.conclusionVectorDigest = digest;
      objectAt(runManifest, 'conclusionVectorDigests')[String(vector.vectorId)] = digest;
      break;
    }
    case 'run-vector-digest-drift':
      objectAt(runManifest, 'conclusionVectorDigests')[String(vector.vectorId)] =
        `sha256:${'2'.repeat(64)}`;
      break;
    case 'vector-node-linkage-drift': {
      const claims = arrayAt(vector, 'claims') as JsonRecord[];
      (claims[0]!.stateNodeIds as unknown[]).push('bazi.shadow.undeclared');
      const digest = canonicalSha256(vector);
      matrix.conclusionVectorDigest = digest;
      objectAt(runManifest, 'conclusionVectorDigests')[String(vector.vectorId)] = digest;
      break;
    }
    case 'conclusion-case-reordered': {
      const cases = arrayAt(matrix, 'invalidationCases');
      [cases[0], cases[1]] = [cases[1], cases[0]];
      break;
    }
    case 'conclusion-topic-reuse-flipped':
      (arrayAt(matrix, 'invalidationCases')[5] as JsonRecord).conclusionVectorReusable = true;
      break;
    case 'conclusion-forbidden-field':
      matrix.prompt = 'synthetic-private-value';
      break;
    default:
      throw new Error(`mutation target mismatch: ${mutation}`);
  }
  return verifyConclusionVectorInvalidationMatrix(matrix, stateManifest, chart, vector, runManifest)
    .issues;
}

function observeLifecycleMutation(
  mutation: VerificationMutationName,
  inputs: VerificationMutationInputs,
): readonly VerificationMutationObservedIssue[] {
  const matrix = copy(inputs.lifecycleMatrix) as JsonRecord;
  switch (mutation) {
    case 'lifecycle-state-linkage-drift':
      matrix.stateDigest = `sha256:${'3'.repeat(64)}`;
      break;
    case 'lifecycle-case-missing':
      arrayAt(matrix, 'cases').pop();
      break;
    case 'lifecycle-case-reordered': {
      const cases = arrayAt(matrix, 'cases');
      [cases[0], cases[1]] = [cases[1], cases[0]];
      break;
    }
    case 'lifecycle-duplicate-cause':
      ((arrayAt(matrix, 'cases')[1] as JsonRecord).causes as unknown[]).push('input-chart');
      break;
    case 'lifecycle-variant-unknown':
      (arrayAt(matrix, 'cases')[0] as JsonRecord).rightStateVariant = 'runtime-cache';
      break;
    case 'lifecycle-decision-flipped':
      objectAt(arrayAt(matrix, 'cases')[8] as JsonRecord, 'expected').stateRecordReusable = true;
      break;
    case 'lifecycle-cause-omitted':
      (arrayAt(matrix, 'cases')[1] as JsonRecord).causes = [];
      break;
    default:
      throw new Error(`mutation target mismatch: ${mutation}`);
  }
  return verifySyntheticShadowStateLifecycle(matrix, inputs.stateManifest, inputs.chart).issues;
}

/** Observe only stable diagnostic code/path pairs for one fixed synthetic mutation. */
export function observeVerificationMutationIssues(
  mutation: VerificationMutationName,
  inputs: VerificationMutationInputs,
): readonly VerificationMutationObservedIssue[] {
  const spec = VERIFICATION_MUTATION_SPECS.find((entry) => entry[1] === mutation);
  if (spec === undefined) throw new Error(`unknown fixed mutation: ${mutation}`);
  if (spec[0] === 'shadow-state-contract') {
    const state = projectBaselineState(inputs);
    if (state === null) throw new Error('invalid baseline state');
    return observeStateMutation(mutation, state);
  }
  if (spec[0] === 'shadow-state-integrity') return observeIntegrityMutation(mutation, inputs);
  if (spec[0] === 'conclusion-vector-invalidation') {
    return observeConclusionMutation(mutation, inputs);
  }
  return observeLifecycleMutation(mutation, inputs);
}

function verifyCatalogShape(
  catalogValue: unknown,
  issues: VerificationMutationVerificationIssue[],
): JsonRecord | null {
  inspectForbiddenFields(catalogValue, '$.catalog', issues);
  const catalog = record(catalogValue);
  if (catalog === null || !exactKeys(catalog, CATALOG_KEYS)) {
    add(issues, 'CATALOG_SHAPE', '$.catalog');
    return null;
  }
  if (catalog.contractVersion !== 'verification-mutation-matrix/v1') {
    add(issues, 'CATALOG_SHAPE', '$.catalog.contractVersion');
  }
  if (typeof catalog.suiteId !== 'string' || !SUITE_ID.test(catalog.suiteId)) {
    add(issues, 'CATALOG_SHAPE', '$.catalog.suiteId');
  }
  if (typeof catalog.fixtureId !== 'string' || !SYNTHETIC_ID.test(catalog.fixtureId)) {
    add(issues, 'CATALOG_SHAPE', '$.catalog.fixtureId');
  }
  if (catalog.mode !== 'deterministic-local-only') {
    add(issues, 'CATALOG_SHAPE', '$.catalog.mode');
  }
  const digests = record(catalog.baselineDigests);
  if (digests === null || !exactKeys(digests, DIGEST_KEYS)) {
    add(issues, 'CATALOG_SHAPE', '$.catalog.baselineDigests');
  } else {
    for (const key of DIGEST_KEYS) {
      if (typeof digests[key] !== 'string' || !SHA256.test(digests[key] as string)) {
        add(issues, 'CATALOG_SHAPE', `$.catalog.baselineDigests.${key}`);
      }
    }
  }
  if (
    !Array.isArray(catalog.exclusionPolicy) ||
    catalog.exclusionPolicy.length === 0 ||
    catalog.exclusionPolicy.some(
      (entry) => typeof entry !== 'string' || !/^[a-z][a-z0-9-]*$/.test(entry),
    )
  ) {
    add(issues, 'CATALOG_SHAPE', '$.catalog.exclusionPolicy');
  }
  if (
    !Array.isArray(catalog.cases) ||
    catalog.cases.length !== VERIFICATION_MUTATION_SPECS.length
  ) {
    add(issues, 'MUTATION_SET', '$.catalog.cases');
    return catalog;
  }
  catalog.cases.forEach((entry, index) => {
    const mutationCase = record(entry);
    const path = `$.catalog.cases[${index}]`;
    const [target, mutation] = VERIFICATION_MUTATION_SPECS[index]!;
    if (mutationCase === null || !exactKeys(mutationCase, CASE_KEYS)) {
      add(issues, 'CATALOG_SHAPE', path);
      return;
    }
    if (
      typeof mutationCase.caseId !== 'string' ||
      !CASE_ID.test(mutationCase.caseId) ||
      mutationCase.caseId !== `mutation:synthetic:${mutation}`
    ) {
      add(issues, 'MUTATION_SET', `${path}.caseId`);
    }
    if (mutationCase.target !== target) add(issues, 'MUTATION_SET', `${path}.target`);
    if (mutationCase.mutation !== mutation) add(issues, 'MUTATION_SET', `${path}.mutation`);
    if (!Array.isArray(mutationCase.expectedIssues) || mutationCase.expectedIssues.length === 0) {
      add(issues, 'CATALOG_SHAPE', `${path}.expectedIssues`);
      return;
    }
    mutationCase.expectedIssues.forEach((expectedIssue, issueIndex) => {
      const item = record(expectedIssue);
      const itemPath = `${path}.expectedIssues[${issueIndex}]`;
      if (
        item === null ||
        !exactKeys(item, EXPECTED_ISSUE_KEYS) ||
        typeof item.code !== 'string' ||
        !/^[A-Z][A-Z0-9_]*$/.test(item.code) ||
        typeof item.path !== 'string' ||
        !item.path.startsWith('$')
      ) {
        add(issues, 'CATALOG_SHAPE', itemPath);
      }
    });
  });
  return catalog;
}

function verifyBaselines(
  catalog: JsonRecord,
  inputs: VerificationMutationInputs,
  issues: VerificationMutationVerificationIssue[],
): boolean {
  const digests = record(catalog.baselineDigests);
  if (digests === null) return false;
  const entries: readonly [string, unknown][] = [
    ['chart', inputs.chart],
    ['stateManifest', inputs.stateManifest],
    ['conclusionVector', inputs.conclusionVector],
    ['runManifest', inputs.runManifest],
    ['conclusionInvalidationMatrix', inputs.conclusionInvalidationMatrix],
    ['lifecycleMatrix', inputs.lifecycleMatrix],
  ];
  for (const [key, value] of entries) {
    if (digests[key] !== canonicalSha256(value)) {
      add(issues, 'LINKAGE', `$.catalog.baselineDigests.${key}`);
    }
  }
  const state = projectBaselineState(inputs);
  if (state === null || !verifyBaziShadowState(state).ok) add(issues, 'BASELINE', '$.state');
  if (!verifySyntheticShadowStateIntegrity(inputs.stateManifest, inputs.chart).ok) {
    add(issues, 'BASELINE', '$.stateManifest');
  }
  if (
    !verifyConclusionVectorInvalidationMatrix(
      inputs.conclusionInvalidationMatrix,
      inputs.stateManifest,
      inputs.chart,
      inputs.conclusionVector,
      inputs.runManifest,
    ).ok
  ) {
    add(issues, 'BASELINE', '$.conclusionInvalidationMatrix');
  }
  if (
    !verifySyntheticShadowStateLifecycle(inputs.lifecycleMatrix, inputs.stateManifest, inputs.chart)
      .ok
  ) {
    add(issues, 'BASELINE', '$.lifecycleMatrix');
  }
  return issues.length === 0;
}

/**
 * Run a fixed synthetic fault catalog against the already-existing verifiers.
 * This proves only that declared contract faults are detected; it is not a
 * metaphysical accuracy percentage, runtime self-healing layer, or mutation API.
 */
export function verifySyntheticVerificationMutations(
  catalogValue: unknown,
  inputs: VerificationMutationInputs,
): VerificationMutationVerificationResult {
  const issues: VerificationMutationVerificationIssue[] = [];
  const detectedCaseIds: string[] = [];
  const catalog = verifyCatalogShape(catalogValue, issues);
  if (catalog === null || issues.length > 0 || !verifyBaselines(catalog, inputs, issues)) {
    return { ok: false, detectedCaseIds, issues };
  }
  const cases = catalog.cases as JsonRecord[];
  cases.forEach((mutationCase, index) => {
    const mutation = VERIFICATION_MUTATION_SPECS[index]![1];
    const actual = observeVerificationMutationIssues(mutation, inputs);
    if (canonicalJson(actual) === canonicalJson(mutationCase.expectedIssues)) {
      detectedCaseIds.push(String(mutationCase.caseId));
    } else {
      add(issues, 'DETECTION', `$.catalog.cases[${index}].expectedIssues`);
    }
  });
  return { ok: issues.length === 0, detectedCaseIds, issues };
}

interface CliArgs {
  catalog: string;
  chart: string;
  stateManifest: string;
  vector: string;
  runManifest: string;
  conclusionMatrix: string;
  lifecycleMatrix: string;
}

function parseArgs(args: readonly string[]): CliArgs | null {
  const option = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const parsed = {
    catalog: option('--catalog'),
    chart: option('--chart'),
    stateManifest: option('--state-manifest'),
    vector: option('--vector'),
    runManifest: option('--run-manifest'),
    conclusionMatrix: option('--conclusion-matrix'),
    lifecycleMatrix: option('--lifecycle-matrix'),
  };
  return Object.values(parsed).every((value) => typeof value === 'string')
    ? (parsed as CliArgs)
    : null;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    process.stderr.write(
      'Usage: node tools/eval/verify-verification-mutations.ts --catalog <file> --chart <file> --state-manifest <file> --vector <file> --run-manifest <file> --conclusion-matrix <file> --lifecycle-matrix <file>\n',
    );
    process.exit(2);
  }
  let result: VerificationMutationVerificationResult;
  try {
    result = verifySyntheticVerificationMutations(readJson(args.catalog), {
      chart: readJson(args.chart),
      stateManifest: readJson(args.stateManifest),
      conclusionVector: readJson(args.vector),
      runManifest: readJson(args.runManifest),
      conclusionInvalidationMatrix: readJson(args.conclusionMatrix),
      lifecycleMatrix: readJson(args.lifecycleMatrix),
    });
  } catch {
    process.stderr.write('[FAIL] could not read a JSON synthetic evaluation artifact.\n');
    process.exit(1);
  }
  for (const issue of result.issues) process.stdout.write(`[FAIL] ${issue.code} ${issue.path}\n`);
  if (!result.ok) process.exit(1);
  process.stdout.write(
    `[PASS] synthetic verifier mutations caught: ${result.detectedCaseIds.length}/${VERIFICATION_MUTATION_SPECS.length} (${resolve(args.catalog)})\n`,
  );
}

const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)) main();
