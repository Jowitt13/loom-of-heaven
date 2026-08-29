import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  VERIFICATION_MUTATION_SPECS,
  verifySyntheticVerificationMutations,
  type VerificationMutationInputs,
} from './verify-verification-mutations.ts';
import { canonicalSha256 } from './verify-eval-manifest.ts';

/** Fixed risk layers defended by the existing P0/P1/P2 eval verifiers. */
export type VerificationCoverageLayer =
  | 'contract-shape'
  | 'privacy-field-exclusion'
  | 'baseline-integrity-linkage'
  | 'dependency-collector-linkage'
  | 'invalidation-truth-table'
  | 'conclusion-vector-linkage'
  | 'lifecycle-reuse-decision'
  | 'mutation-detection-evidence';

/** Traceability statuses only; they never aggregate into an accuracy score. */
export type VerificationCoverageStatus =
  'covered' | 'partially-covered' | 'blocked' | 'out-of-scope';

export const VERIFICATION_COVERAGE_LAYERS = [
  'contract-shape',
  'privacy-field-exclusion',
  'baseline-integrity-linkage',
  'dependency-collector-linkage',
  'invalidation-truth-table',
  'conclusion-vector-linkage',
  'lifecycle-reuse-decision',
  'mutation-detection-evidence',
] as const;

export const VERIFICATION_COVERAGE_STATUSES = [
  'covered',
  'partially-covered',
  'blocked',
  'out-of-scope',
] as const;

/**
 * Implementer-owned gap registry. The fixture only stores these stable ids;
 * explanations live here and in the README so no free-text can be self-reported.
 */
export const VERIFICATION_COVERAGE_GAP_REGISTRY = {
  'p0d-contract-no-dedicated-mutation':
    'The P0-D eval-run-manifest and conclusion-vector contract shapes are enforced by verifyEvalManifestPair and its negative tests, but the P2-B catalog has no mutation row that directly mutates those contract shapes; they are only exercised indirectly through P0-F linkage mutations.',
  'collector-algorithm-mutation-not-covered':
    'Shadow-state collectors are verified at the serialized-artifact level (state contract shape, dependency and collector links); no mutation simulates a fault inside the D1/D2 collector implementations themselves.',
} as const satisfies Record<string, string>;

export type VerificationCoverageGapId = keyof typeof VERIFICATION_COVERAGE_GAP_REGISTRY;

export interface VerificationCoverageVerifierBinding {
  readonly file: string;
  readonly exportName: string;
}

export interface VerificationCoverageTestBinding {
  readonly file: string;
  readonly testTitle: string;
}

export type VerificationCoverageNegativeBinding =
  | { readonly kind: 'mutation-case'; readonly caseId: string }
  | { readonly kind: 'negative-test'; readonly file: string; readonly testTitle: string };

export interface VerificationCoverageRiskSpec {
  readonly riskId: string;
  readonly layer: VerificationCoverageLayer;
  readonly expectedStatus: VerificationCoverageStatus;
  readonly expectedGapIds: readonly VerificationCoverageGapId[];
  readonly requiredVerifierBindings: readonly VerificationCoverageVerifierBinding[];
  readonly requiredPositiveTestBindings: readonly VerificationCoverageTestBinding[];
  readonly requiredNegativeBindings: readonly VerificationCoverageNegativeBinding[];
}

const SHADOW_STATE_VERIFY_FILE = 'packages/bazi-rules/src/shadow-state-verify.ts';
const INTEGRITY_FILE = 'tools/eval/verify-shadow-state-integrity.ts';
const CONCLUSION_FILE = 'tools/eval/verify-conclusion-vector-invalidation.ts';
const LIFECYCLE_FILE = 'tools/eval/verify-shadow-state-lifecycle.ts';
const MUTATIONS_FILE = 'tools/eval/verify-verification-mutations.ts';
const EVAL_MANIFEST_FILE = 'tools/eval/verify-eval-manifest.ts';
const SHADOW_STATE_VERIFY_TEST = 'packages/bazi-rules/test/shadow-state-verify.test.ts';
const CONTRACTS_TEST = 'tools/eval-contracts.test.ts';
const INTEGRITY_TEST = 'tools/eval-shadow-state-integrity.test.ts';
const CONCLUSION_TEST = 'tools/eval-conclusion-vector-invalidation.test.ts';
const LIFECYCLE_TEST = 'tools/eval-shadow-state-lifecycle.test.ts';
const MUTATIONS_TEST = 'tools/eval-verification-mutations.test.ts';

/**
 * Fixed risk set. The committed fixture must match these specs item by item,
 * in order, field by field; it can never invent risks, statuses, or bindings.
 */
export const VERIFICATION_COVERAGE_RISK_SPECS = [
  {
    riskId: 'risk:synthetic:contract-shape',
    layer: 'contract-shape',
    expectedStatus: 'partially-covered',
    expectedGapIds: ['p0d-contract-no-dedicated-mutation'],
    requiredVerifierBindings: [
      { file: SHADOW_STATE_VERIFY_FILE, exportName: 'verifyBaziShadowState' },
      { file: EVAL_MANIFEST_FILE, exportName: 'verifyEvalManifestPair' },
    ],
    requiredPositiveTestBindings: [
      {
        file: SHADOW_STATE_VERIFY_TEST,
        testTitle: 'accepts the P0-B projection and returns a byte-identical verification result',
      },
      {
        file: CONTRACTS_TEST,
        testTitle: 'accepts the committed synthetic local pair and keeps results byte-identical',
      },
    ],
    requiredNegativeBindings: [
      { kind: 'mutation-case', caseId: 'mutation:synthetic:state-node-order-swapped' },
      { kind: 'mutation-case', caseId: 'mutation:synthetic:integrity-contract-version-drift' },
      {
        kind: 'negative-test',
        file: CONTRACTS_TEST,
        testTitle: 'rejects contract-version, exact-shape, and artifact-linkage drift',
      },
    ],
  },
  {
    riskId: 'risk:synthetic:privacy-field-exclusion',
    layer: 'privacy-field-exclusion',
    expectedStatus: 'covered',
    expectedGapIds: [],
    requiredVerifierBindings: [
      { file: SHADOW_STATE_VERIFY_FILE, exportName: 'verifyBaziShadowState' },
      { file: INTEGRITY_FILE, exportName: 'verifySyntheticShadowStateIntegrity' },
      { file: CONCLUSION_FILE, exportName: 'verifyConclusionVectorInvalidationMatrix' },
      { file: LIFECYCLE_FILE, exportName: 'verifySyntheticShadowStateLifecycle' },
      { file: MUTATIONS_FILE, exportName: 'verifySyntheticVerificationMutations' },
    ],
    requiredPositiveTestBindings: [
      {
        file: SHADOW_STATE_VERIFY_TEST,
        testTitle: 'accepts the P0-B projection and returns a byte-identical verification result',
      },
      {
        file: INTEGRITY_TEST,
        testTitle: 'rebuilds the committed synthetic state with the declared canonical digest',
      },
      {
        file: CONCLUSION_TEST,
        testTitle: 'accepts the committed P0-D/P0-E linkage deterministically',
      },
      {
        file: LIFECYCLE_TEST,
        testTitle: 'accepts the committed P0-E/P1-A/P1-B/P1-C lifecycle evidence deterministically',
      },
      {
        file: MUTATIONS_TEST,
        testTitle: 'detects every committed fixed mutation deterministically',
      },
    ],
    requiredNegativeBindings: [
      { kind: 'mutation-case', caseId: 'mutation:synthetic:state-forbidden-field' },
      { kind: 'mutation-case', caseId: 'mutation:synthetic:integrity-forbidden-field' },
      { kind: 'mutation-case', caseId: 'mutation:synthetic:conclusion-forbidden-field' },
      {
        kind: 'negative-test',
        file: SHADOW_STATE_VERIFY_TEST,
        testTitle:
          'rejects raw birth, location, model-reasoning, and answer-layer fields at any depth',
      },
      {
        kind: 'negative-test',
        file: INTEGRITY_TEST,
        testTitle:
          'finds prohibited private or model fields by category and path without echoing their values',
      },
      {
        kind: 'negative-test',
        file: CONCLUSION_TEST,
        testTitle:
          'reports private or model fields by category and path without echoing their values',
      },
      {
        kind: 'negative-test',
        file: LIFECYCLE_TEST,
        testTitle:
          'reports private or model fields by category and path without echoing their values',
      },
      {
        kind: 'negative-test',
        file: MUTATIONS_TEST,
        testTitle: 'reports prohibited fields by path without echoing their values',
      },
    ],
  },
  {
    riskId: 'risk:synthetic:baseline-integrity-linkage',
    layer: 'baseline-integrity-linkage',
    expectedStatus: 'covered',
    expectedGapIds: [],
    requiredVerifierBindings: [
      { file: INTEGRITY_FILE, exportName: 'verifySyntheticShadowStateIntegrity' },
    ],
    requiredPositiveTestBindings: [
      {
        file: INTEGRITY_TEST,
        testTitle: 'rebuilds the committed synthetic state with the declared canonical digest',
      },
      {
        file: INTEGRITY_TEST,
        testTitle:
          'binds the manifest digest to a reproducible P0-B projection, not to opaque identity alone',
      },
    ],
    requiredNegativeBindings: [
      { kind: 'mutation-case', caseId: 'mutation:synthetic:integrity-digest-drift' },
      { kind: 'mutation-case', caseId: 'mutation:synthetic:integrity-chart-scope-drift' },
    ],
  },
  {
    riskId: 'risk:synthetic:dependency-collector-linkage',
    layer: 'dependency-collector-linkage',
    expectedStatus: 'partially-covered',
    expectedGapIds: ['collector-algorithm-mutation-not-covered'],
    requiredVerifierBindings: [
      { file: SHADOW_STATE_VERIFY_FILE, exportName: 'verifyBaziShadowState' },
    ],
    requiredPositiveTestBindings: [
      {
        file: SHADOW_STATE_VERIFY_TEST,
        testTitle: 'requires the declared derived-structure layer, dependencies, and invalidations',
      },
      {
        file: SHADOW_STATE_VERIFY_TEST,
        testTitle: 'requires the four collector values to share one chart source',
      },
      {
        file: SHADOW_STATE_VERIFY_TEST,
        testTitle: 'requires D2 strength and pattern values to retain their declared D1 links',
      },
    ],
    requiredNegativeBindings: [
      { kind: 'mutation-case', caseId: 'mutation:synthetic:state-dependency-dropped' },
      { kind: 'mutation-case', caseId: 'mutation:synthetic:state-collector-link-drift' },
    ],
  },
  {
    riskId: 'risk:synthetic:invalidation-truth-table',
    layer: 'invalidation-truth-table',
    expectedStatus: 'covered',
    expectedGapIds: [],
    requiredVerifierBindings: [
      { file: INTEGRITY_FILE, exportName: 'verifySyntheticShadowStateIntegrity' },
      { file: CONCLUSION_FILE, exportName: 'verifyConclusionVectorInvalidationMatrix' },
    ],
    requiredPositiveTestBindings: [
      {
        file: INTEGRITY_TEST,
        testTitle:
          'locks every chart-affecting cause to all shadow nodes and keeps narration-only causes reusable',
      },
      {
        file: CONCLUSION_TEST,
        testTitle: 'locks the structural, topic/lens, and language/narrator reuse truth table',
      },
    ],
    requiredNegativeBindings: [
      { kind: 'mutation-case', caseId: 'mutation:synthetic:conclusion-case-reordered' },
      { kind: 'mutation-case', caseId: 'mutation:synthetic:conclusion-topic-reuse-flipped' },
      { kind: 'mutation-case', caseId: 'mutation:synthetic:lifecycle-cause-omitted' },
    ],
  },
  {
    riskId: 'risk:synthetic:conclusion-vector-linkage',
    layer: 'conclusion-vector-linkage',
    expectedStatus: 'covered',
    expectedGapIds: [],
    requiredVerifierBindings: [
      { file: CONCLUSION_FILE, exportName: 'verifyConclusionVectorInvalidationMatrix' },
    ],
    requiredPositiveTestBindings: [
      {
        file: CONCLUSION_TEST,
        testTitle:
          'binds the P0-D conclusion vector to the actual P0-E state digest and run digest',
      },
      {
        file: CONCLUSION_TEST,
        testTitle: 'uses only declared P0-B shadow-state node ids in every conclusion claim',
      },
    ],
    requiredNegativeBindings: [
      { kind: 'mutation-case', caseId: 'mutation:synthetic:vector-state-linkage-drift' },
      { kind: 'mutation-case', caseId: 'mutation:synthetic:run-vector-digest-drift' },
      { kind: 'mutation-case', caseId: 'mutation:synthetic:vector-node-linkage-drift' },
    ],
  },
  {
    riskId: 'risk:synthetic:lifecycle-reuse-decision',
    layer: 'lifecycle-reuse-decision',
    expectedStatus: 'covered',
    expectedGapIds: [],
    requiredVerifierBindings: [
      { file: LIFECYCLE_FILE, exportName: 'verifySyntheticShadowStateLifecycle' },
    ],
    requiredPositiveTestBindings: [
      {
        file: LIFECYCLE_TEST,
        testTitle: 'accepts the committed P0-E/P1-A/P1-B/P1-C lifecycle evidence deterministically',
      },
      {
        file: LIFECYCLE_TEST,
        testTitle: 'keeps equal state reusable only for no-change and projection-only causes',
      },
    ],
    requiredNegativeBindings: [
      { kind: 'mutation-case', caseId: 'mutation:synthetic:lifecycle-case-missing' },
      { kind: 'mutation-case', caseId: 'mutation:synthetic:lifecycle-case-reordered' },
      { kind: 'mutation-case', caseId: 'mutation:synthetic:lifecycle-duplicate-cause' },
      { kind: 'mutation-case', caseId: 'mutation:synthetic:lifecycle-variant-unknown' },
      { kind: 'mutation-case', caseId: 'mutation:synthetic:lifecycle-decision-flipped' },
    ],
  },
  {
    riskId: 'risk:synthetic:mutation-detection-evidence',
    layer: 'mutation-detection-evidence',
    expectedStatus: 'covered',
    expectedGapIds: [],
    requiredVerifierBindings: [
      { file: MUTATIONS_FILE, exportName: 'verifySyntheticVerificationMutations' },
    ],
    requiredPositiveTestBindings: [
      {
        file: MUTATIONS_TEST,
        testTitle: 'detects every committed fixed mutation deterministically',
      },
    ],
    requiredNegativeBindings: [
      {
        kind: 'negative-test',
        file: MUTATIONS_TEST,
        testTitle: 'rejects a baseline digest drift before reporting mutation success',
      },
      {
        kind: 'negative-test',
        file: MUTATIONS_TEST,
        testTitle: 'rejects a semantically false expected diagnostic',
      },
      {
        kind: 'negative-test',
        file: MUTATIONS_TEST,
        testTitle: 'rejects reordered, incomplete, or duplicated catalog entries before injection',
      },
    ],
  },
] as const satisfies readonly VerificationCoverageRiskSpec[];

export type VerificationCoverageVerificationCode =
  | 'COVERAGE_SHAPE'
  | 'PRIVACY'
  | 'CATALOG_LINKAGE'
  | 'RISK_SET'
  | 'BINDING'
  | 'STATUS_CONSISTENCY'
  | 'RUNTIME_BOUNDARY';

export interface VerificationCoverageVerificationIssue {
  code: VerificationCoverageVerificationCode;
  path: string;
}

export interface VerificationCoverageVerificationResult {
  ok: boolean;
  riskRowsVerified: number;
  detectedMutations: number;
  issues: readonly VerificationCoverageVerificationIssue[];
}

type JsonRecord = Record<string, unknown>;

const MATRIX_KEYS = [
  'contractVersion',
  'suiteId',
  'fixtureId',
  'mode',
  'mutationCatalogDigest',
  'rows',
  'exclusionPolicy',
];
const ROW_KEYS = [
  'riskId',
  'layer',
  'coverageStatus',
  'verifierBindings',
  'positiveTestBindings',
  'negativeBindings',
  'gapIds',
];
const VERIFIER_BINDING_KEYS = ['file', 'exportName'];
const TEST_BINDING_KEYS = ['file', 'testTitle'];
const MUTATION_BINDING_KEYS = ['kind', 'caseId'];
const NEGATIVE_TEST_BINDING_KEYS = ['kind', 'file', 'testTitle'];
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const RISK_ID = /^risk:synthetic:[a-z0-9][a-z0-9._-]*$/;
const MUTATION_CASE_ID = /^mutation:synthetic:[a-z0-9][a-z0-9._-]*$/;
const POLICY_ENTRY = /^[a-z][a-z0-9-]*$/;
const DOT_ONLY_SEGMENT = /^\.+$/;
const COVERAGE_CONTRACT_VERSION = 'verification-coverage-matrix/v1';
const COVERAGE_SUITE_ID = 'coverage-suite:synthetic:interpretation-state-p2c';
const COVERAGE_FIXTURE_ID = 'synthetic:bazi-shadow-p0';

// Binding paths may only point at tracked verifier sources and test files.
// The allowlist shapes below admit no separator escapes at all, so an unsafe
// path can never reach the filesystem; the containment check afterwards is a
// second, independent guard.
const FORBIDDEN_PATH_ROOTS = new Set(['skills', 'dist', 'releases', 'docs', 'evals', '.github']);
const VERIFIER_FILE =
  /^tools\/eval\/[a-zA-Z0-9._-]+\.ts$|^packages\/[a-z-]+\/src\/[a-zA-Z0-9._-]+\.ts$/;
const TEST_FILE =
  /^tools\/[a-zA-Z0-9._-]+\.test\.ts$|^packages\/[a-z-]+\/test\/[a-zA-Z0-9._-]+\.test\.ts$/;

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

interface BindingSourceCache {
  sources: Map<string, ts.SourceFile | null>;
  testTitles: Map<string, Set<string> | null>;
}

function findRepoRoot(startDirectory: string): string {
  let current = startDirectory;
  for (;;) {
    if (existsSync(join(current, 'package.json'))) return current;
    const parent = dirname(current);
    if (parent === current) return startDirectory;
    current = parent;
  }
}

const REPO_ROOT = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  if (actual.length !== expected.length) return false;
  const seen = new Set(actual);
  return expected.every((key) => seen.has(key));
}

function add(
  issues: VerificationCoverageVerificationIssue[],
  code: VerificationCoverageVerificationCode,
  path: string,
): void {
  issues.push({ code, path });
}

/**
 * Deep structural equality over JSON-shaped values (objects, arrays,
 * primitives). Order of object keys is irrelevant; array order is preserved.
 * Used for the spec-vs-fixture conformance checks in place of a canonical
 * serialized form — equality is the only contract here, never ordering.
 */
function deepEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((entry, index) => deepEquals(entry, b[index]))
    );
  }
  const left = record(a);
  const right = record(b);
  if (left === null || right === null) return false;
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  const rightKeys = new Set(Object.keys(right));
  return leftKeys.every((key) => rightKeys.has(key) && deepEquals(left[key], right[key]));
}

function inspectForbiddenFields(
  value: unknown,
  path: string,
  issues: VerificationCoverageVerificationIssue[],
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

/** The single guarded filesystem sink: repository-internal text reads only. */
function readRepoTextFile(relativePath: string): string | null {
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    isAbsolute(relativePath) ||
    relativePath.includes('\\')
  ) {
    return null;
  }
  const segments = relativePath.split('/');
  if (segments.some((segment) => segment.length === 0 || DOT_ONLY_SEGMENT.test(segment))) {
    return null;
  }
  if (segments.some((segment) => segment.toLowerCase() === 'node_modules')) return null;
  const rootPrefix = REPO_ROOT.endsWith(sep) ? REPO_ROOT : `${REPO_ROOT}${sep}`;
  const absolute = resolve(REPO_ROOT, relativePath);
  if (!absolute.startsWith(rootPrefix)) return null;
  try {
    return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
  } catch {
    return null;
  }
}

/**
 * Reject binding paths that escape the repository (traversal, absolute, or
 * backslash paths), enter dependency or generated trees, or fall outside the
 * tracked verifier/test file conventions.
 */
function pathIssue(role: 'verifier' | 'test', value: unknown): boolean {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    isAbsolute(value) ||
    value.includes('\\')
  ) {
    return true;
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment.length === 0 || DOT_ONLY_SEGMENT.test(segment))) {
    return true;
  }
  if (segments.some((segment) => segment.toLowerCase() === 'node_modules')) return true;
  if (FORBIDDEN_PATH_ROOTS.has(segments[0]!)) return true;
  if (role === 'verifier') {
    if (value.endsWith('.test.ts')) return true;
    if (!VERIFIER_FILE.test(value)) return true;
  } else if (!TEST_FILE.test(value)) {
    return true;
  }
  const rootPrefix = REPO_ROOT.endsWith(sep) ? REPO_ROOT : `${REPO_ROOT}${sep}`;
  return !resolve(REPO_ROOT, value).startsWith(rootPrefix);
}

function loadSource(relativePath: string, cache: BindingSourceCache): ts.SourceFile | null {
  const cached = cache.sources.get(relativePath);
  if (cached !== undefined) return cached;
  let source: ts.SourceFile | null = null;
  const text = readRepoTextFile(relativePath);
  if (text !== null) {
    source = ts.createSourceFile(
      resolve(REPO_ROOT, relativePath),
      text,
      ts.ScriptTarget.Latest,
      true,
    );
  }
  cache.sources.set(relativePath, source);
  return source;
}

function hasExportedFunction(source: ts.SourceFile, exportName: string): boolean {
  for (const statement of source.statements) {
    if (!ts.isFunctionDeclaration(statement)) continue;
    if (statement.name === undefined || statement.name.text !== exportName) continue;
    const exported = (statement.modifiers ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (exported) return true;
  }
  return false;
}

function loadTestTitles(relativePath: string, cache: BindingSourceCache): Set<string> | null {
  const cached = cache.testTitles.get(relativePath);
  if (cached !== undefined) return cached;
  const source = loadSource(relativePath, cache);
  if (source === null) {
    cache.testTitles.set(relativePath, null);
    return null;
  }
  const titles = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const firstArgument = node.arguments[0];
      if (
        ts.isIdentifier(callee) &&
        (callee.text === 'it' || callee.text === 'test') &&
        firstArgument !== undefined &&
        ts.isStringLiteral(firstArgument)
      ) {
        titles.add(firstArgument.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  cache.testTitles.set(relativePath, titles);
  return titles;
}

function catalogCaseIds(catalogValue: unknown): Set<string> | null {
  const catalog = record(catalogValue);
  if (catalog === null || !Array.isArray(catalog.cases)) return null;
  const ids = new Set<string>();
  for (const entry of catalog.cases) {
    const mutationCase = record(entry);
    if (mutationCase === null || typeof mutationCase.caseId !== 'string') return null;
    ids.add(mutationCase.caseId);
  }
  return ids;
}

function isVerifierBindingArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => {
      const binding = record(entry);
      return (
        binding !== null &&
        exactKeys(binding, VERIFIER_BINDING_KEYS) &&
        typeof binding.file === 'string' &&
        typeof binding.exportName === 'string' &&
        /^[a-zA-Z][a-zA-Z0-9]*$/.test(binding.exportName)
      );
    })
  );
}

function isTestBindingArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => {
      const binding = record(entry);
      return (
        binding !== null &&
        exactKeys(binding, TEST_BINDING_KEYS) &&
        typeof binding.file === 'string' &&
        typeof binding.testTitle === 'string'
      );
    })
  );
}

function isNegativeBindingArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => {
      const binding = record(entry);
      if (binding === null) return false;
      if (binding.kind === 'mutation-case') {
        return (
          exactKeys(binding, MUTATION_BINDING_KEYS) &&
          typeof binding.caseId === 'string' &&
          MUTATION_CASE_ID.test(binding.caseId)
        );
      }
      if (binding.kind === 'negative-test') {
        return (
          exactKeys(binding, NEGATIVE_TEST_BINDING_KEYS) &&
          typeof binding.file === 'string' &&
          typeof binding.testTitle === 'string'
        );
      }
      return false;
    })
  );
}

function isGapIdArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string' && entry in VERIFICATION_COVERAGE_GAP_REGISTRY)
  );
}

/**
 * Verify the committed synthetic coverage matrix against the implementer-owned
 * risk specs, real verifier/test sources (via the TypeScript AST), and a real
 * re-run of the P2-B mutation gate. This is a local traceability check only:
 * it persists nothing, invokes no model, and never reports an accuracy score.
 */
export function verifySyntheticVerificationCoverage(
  matrixValue: unknown,
  catalogValue: unknown,
  mutationInputs: VerificationMutationInputs,
): VerificationCoverageVerificationResult {
  const issues: VerificationCoverageVerificationIssue[] = [];
  inspectForbiddenFields(matrixValue, '$.matrix', issues);

  const matrix = record(matrixValue);
  if (matrix === null || !exactKeys(matrix, MATRIX_KEYS)) {
    add(issues, 'COVERAGE_SHAPE', '$.matrix');
    return { ok: false, riskRowsVerified: 0, detectedMutations: 0, issues };
  }

  if (matrix.contractVersion !== COVERAGE_CONTRACT_VERSION) {
    add(issues, 'COVERAGE_SHAPE', '$.matrix.contractVersion');
  }
  if (matrix.suiteId !== COVERAGE_SUITE_ID) add(issues, 'COVERAGE_SHAPE', '$.matrix.suiteId');
  if (matrix.fixtureId !== COVERAGE_FIXTURE_ID) add(issues, 'COVERAGE_SHAPE', '$.matrix.fixtureId');
  if (matrix.mode !== 'deterministic-local-only') add(issues, 'COVERAGE_SHAPE', '$.matrix.mode');
  if (
    typeof matrix.mutationCatalogDigest !== 'string' ||
    !SHA256.test(matrix.mutationCatalogDigest)
  ) {
    add(issues, 'COVERAGE_SHAPE', '$.matrix.mutationCatalogDigest');
  }
  if (
    !Array.isArray(matrix.exclusionPolicy) ||
    matrix.exclusionPolicy.length === 0 ||
    matrix.exclusionPolicy.some((entry) => typeof entry !== 'string' || !POLICY_ENTRY.test(entry))
  ) {
    add(issues, 'COVERAGE_SHAPE', '$.matrix.exclusionPolicy');
  }

  if (!Array.isArray(matrix.rows)) {
    add(issues, 'COVERAGE_SHAPE', '$.matrix.rows');
    return { ok: false, riskRowsVerified: 0, detectedMutations: 0, issues };
  }
  const rows = matrix.rows;

  const rowShapeValid: boolean[] = [];
  rows.forEach((entry, index) => {
    const rowPath = `$.matrix.rows[${index}]`;
    const row = record(entry);
    if (row === null || !exactKeys(row, ROW_KEYS)) {
      add(issues, 'COVERAGE_SHAPE', rowPath);
      rowShapeValid[index] = false;
      return;
    }
    let valid = true;
    const requireShape = (condition: boolean, subPath: string): void => {
      if (!condition) {
        add(issues, 'COVERAGE_SHAPE', subPath);
        valid = false;
      }
    };
    requireShape(typeof row.riskId === 'string' && RISK_ID.test(row.riskId), `${rowPath}.riskId`);
    requireShape(
      typeof row.layer === 'string' &&
        (VERIFICATION_COVERAGE_LAYERS as readonly string[]).includes(row.layer),
      `${rowPath}.layer`,
    );
    requireShape(
      typeof row.coverageStatus === 'string' &&
        (VERIFICATION_COVERAGE_STATUSES as readonly string[]).includes(row.coverageStatus),
      `${rowPath}.coverageStatus`,
    );
    requireShape(isVerifierBindingArray(row.verifierBindings), `${rowPath}.verifierBindings`);
    requireShape(isTestBindingArray(row.positiveTestBindings), `${rowPath}.positiveTestBindings`);
    requireShape(isNegativeBindingArray(row.negativeBindings), `${rowPath}.negativeBindings`);
    requireShape(isGapIdArray(row.gapIds), `${rowPath}.gapIds`);
    rowShapeValid[index] = valid;
  });

  if (
    typeof matrix.mutationCatalogDigest === 'string' &&
    SHA256.test(matrix.mutationCatalogDigest)
  ) {
    if (matrix.mutationCatalogDigest !== canonicalSha256(catalogValue)) {
      add(issues, 'CATALOG_LINKAGE', '$.matrix.mutationCatalogDigest');
    }
  }

  // The coverage claims are only meaningful while the P2-B gate really catches
  // every declared synthetic fault on the committed baseline artifacts.
  const gate = verifySyntheticVerificationMutations(catalogValue, mutationInputs);
  const detectedMutations = gate.detectedCaseIds.length;
  if (!gate.ok || detectedMutations !== VERIFICATION_MUTATION_SPECS.length) {
    gate.issues.forEach((_issue, index) => {
      add(issues, 'CATALOG_LINKAGE', `$.mutationGate.issues[${index}]`);
    });
    if (gate.ok && detectedMutations !== VERIFICATION_MUTATION_SPECS.length) {
      add(issues, 'CATALOG_LINKAGE', '$.mutationGate.detectedCaseIds');
    }
    return { ok: false, riskRowsVerified: 0, detectedMutations, issues };
  }

  const caseIds = catalogCaseIds(catalogValue);
  const cache: BindingSourceCache = { sources: new Map(), testTitles: new Map() };
  const conformanceActive = rows.length === VERIFICATION_COVERAGE_RISK_SPECS.length;
  if (!conformanceActive) add(issues, 'RISK_SET', '$.matrix.rows');

  let riskRowsVerified = 0;
  for (let index = 0; index < rows.length; index++) {
    const row = record(rows[index]);
    if (row === null || rowShapeValid[index] !== true) continue;
    const rowPath = `$.matrix.rows[${index}]`;
    let clean = true;
    const mark = (code: VerificationCoverageVerificationCode, subPath: string): void => {
      add(issues, code, subPath);
      clean = false;
    };

    if (conformanceActive) {
      const spec = VERIFICATION_COVERAGE_RISK_SPECS[index]!;
      if (row.riskId !== spec.riskId) mark('RISK_SET', `${rowPath}.riskId`);
      if (row.layer !== spec.layer) mark('RISK_SET', `${rowPath}.layer`);
      if (row.coverageStatus !== spec.expectedStatus) {
        mark('STATUS_CONSISTENCY', `${rowPath}.coverageStatus`);
      }
      if (!deepEquals(row.gapIds, spec.expectedGapIds)) {
        mark('STATUS_CONSISTENCY', `${rowPath}.gapIds`);
      }
      if (!deepEquals(row.verifierBindings, spec.requiredVerifierBindings)) {
        mark('STATUS_CONSISTENCY', `${rowPath}.verifierBindings`);
      }
      if (!deepEquals(row.positiveTestBindings, spec.requiredPositiveTestBindings)) {
        mark('STATUS_CONSISTENCY', `${rowPath}.positiveTestBindings`);
      }
      if (!deepEquals(row.negativeBindings, spec.requiredNegativeBindings)) {
        mark('STATUS_CONSISTENCY', `${rowPath}.negativeBindings`);
      }
    }

    const verifierBindings = Array.isArray(row.verifierBindings) ? row.verifierBindings : [];
    verifierBindings.forEach((bindingValue, bindingIndex) => {
      const bindingPath = `${rowPath}.verifierBindings[${bindingIndex}]`;
      const binding = record(bindingValue);
      if (binding === null || !exactKeys(binding, VERIFIER_BINDING_KEYS)) {
        mark('COVERAGE_SHAPE', bindingPath);
        return;
      }
      if (pathIssue('verifier', binding.file)) {
        mark('RUNTIME_BOUNDARY', `${bindingPath}.file`);
        return;
      }
      const source = loadSource(String(binding.file), cache);
      if (source === null) {
        mark('BINDING', `${bindingPath}.file`);
        return;
      }
      if (!hasExportedFunction(source, String(binding.exportName))) {
        mark('BINDING', `${bindingPath}.exportName`);
      }
    });

    const verifyTestTitle = (
      fileValue: unknown,
      titleValue: unknown,
      bindingPath: string,
    ): void => {
      if (pathIssue('test', fileValue)) {
        mark('RUNTIME_BOUNDARY', `${bindingPath}.file`);
        return;
      }
      const titles = loadTestTitles(String(fileValue), cache);
      if (titles === null) {
        mark('BINDING', `${bindingPath}.file`);
        return;
      }
      if (typeof titleValue !== 'string' || !titles.has(titleValue)) {
        mark('BINDING', `${bindingPath}.testTitle`);
      }
    };

    const positiveBindings = Array.isArray(row.positiveTestBindings)
      ? row.positiveTestBindings
      : [];
    positiveBindings.forEach((bindingValue, bindingIndex) => {
      const bindingPath = `${rowPath}.positiveTestBindings[${bindingIndex}]`;
      const binding = record(bindingValue);
      if (binding === null || !exactKeys(binding, TEST_BINDING_KEYS)) {
        mark('COVERAGE_SHAPE', bindingPath);
        return;
      }
      verifyTestTitle(binding.file, binding.testTitle, bindingPath);
    });

    const negativeBindings = Array.isArray(row.negativeBindings) ? row.negativeBindings : [];
    negativeBindings.forEach((bindingValue, bindingIndex) => {
      const bindingPath = `${rowPath}.negativeBindings[${bindingIndex}]`;
      const binding = record(bindingValue);
      if (binding === null) {
        mark('COVERAGE_SHAPE', bindingPath);
        return;
      }
      if (binding.kind === 'mutation-case') {
        if (
          typeof binding.caseId !== 'string' ||
          caseIds === null ||
          !caseIds.has(binding.caseId)
        ) {
          mark('BINDING', `${bindingPath}.caseId`);
        }
        return;
      }
      if (binding.kind === 'negative-test') {
        verifyTestTitle(binding.file, binding.testTitle, bindingPath);
        return;
      }
      mark('COVERAGE_SHAPE', bindingPath);
    });

    if (clean) riskRowsVerified += 1;
  }

  return { ok: issues.length === 0, riskRowsVerified, detectedMutations, issues };
}

interface CoverageCliArgs {
  matrix: string;
  catalog: string;
  chart: string;
  stateManifest: string;
  vector: string;
  runManifest: string;
  conclusionMatrix: string;
  lifecycleMatrix: string;
}

function parseArgs(args: readonly string[]): CoverageCliArgs | null {
  const option = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const parsed = {
    matrix: option('--matrix'),
    catalog: option('--catalog'),
    chart: option('--chart'),
    stateManifest: option('--state-manifest'),
    vector: option('--vector'),
    runManifest: option('--run-manifest'),
    conclusionMatrix: option('--conclusion-matrix'),
    lifecycleMatrix: option('--lifecycle-matrix'),
  };
  return Object.values(parsed).every((value) => typeof value === 'string')
    ? (parsed as CoverageCliArgs)
    : null;
}

/** The CLI only ever reads these committed development-only synthetic artifacts. */
const COMMITTED_ARTIFACTS = {
  matrix: 'evals/fixtures/synthetic/p2c-verification-coverage-matrix.json',
  catalog: 'evals/fixtures/synthetic/p2b-verification-mutation-matrix.json',
  chart: 'evals/fixtures/synthetic/p0e-bazi-shadow-chart.json',
  stateManifest: 'evals/fixtures/synthetic/p0e-shadow-state-integrity-manifest.json',
  vector: 'evals/fixtures/synthetic/p0d-conclusion-vector.json',
  runManifest: 'evals/fixtures/synthetic/p0d-eval-run-manifest.json',
  conclusionMatrix: 'evals/fixtures/synthetic/p0f-conclusion-vector-invalidation-matrix.json',
  lifecycleMatrix: 'evals/fixtures/synthetic/p2a-shadow-state-lifecycle-matrix.json',
} as const;

function readCommittedFixture(role: keyof typeof COMMITTED_ARTIFACTS, provided: string): unknown {
  const committed: string = COMMITTED_ARTIFACTS[role];
  // Flag values are assertions, never path input: the filesystem only ever
  // sees the committed literal path for the role.
  if (provided !== committed) {
    throw new Error('only the committed synthetic fixture path is allowed');
  }
  const text = readRepoTextFile(committed);
  if (text === null) throw new Error('could not read a JSON synthetic evaluation artifact');
  return JSON.parse(text);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    process.stderr.write(
      'Usage: node tools/eval/verify-verification-coverage.ts --matrix <file> --catalog <file> --chart <file> --state-manifest <file> --vector <file> --run-manifest <file> --conclusion-matrix <file> --lifecycle-matrix <file>\n',
    );
    process.exit(2);
  }
  let result: VerificationCoverageVerificationResult;
  try {
    result = verifySyntheticVerificationCoverage(
      readCommittedFixture('matrix', args.matrix),
      readCommittedFixture('catalog', args.catalog),
      {
        chart: readCommittedFixture('chart', args.chart),
        stateManifest: readCommittedFixture('stateManifest', args.stateManifest),
        conclusionVector: readCommittedFixture('vector', args.vector),
        runManifest: readCommittedFixture('runManifest', args.runManifest),
        conclusionInvalidationMatrix: readCommittedFixture(
          'conclusionMatrix',
          args.conclusionMatrix,
        ),
        lifecycleMatrix: readCommittedFixture('lifecycleMatrix', args.lifecycleMatrix),
      },
    );
  } catch {
    process.stderr.write('[FAIL] could not read a JSON synthetic evaluation artifact.\n');
    process.exit(1);
  }
  for (const issue of result.issues) process.stdout.write(`[FAIL] ${issue.code} ${issue.path}\n`);
  if (!result.ok) process.exit(1);
  process.stdout.write(
    `[PASS] synthetic verification coverage: risk rows verified ${result.riskRowsVerified}/${VERIFICATION_COVERAGE_RISK_SPECS.length} (${COMMITTED_ARTIFACTS.matrix})\n`,
  );
  process.stdout.write(
    `[PASS] declared synthetic faults caught: ${result.detectedMutations}/${VERIFICATION_MUTATION_SPECS.length} (${COMMITTED_ARTIFACTS.catalog})\n`,
  );
}

const entry = process.argv[1];
if (entry !== undefined && entry === fileURLToPath(import.meta.url)) main();
