import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * IQ-0A foundation verifier — development-only, offline, deterministic.
 *
 * It checks that the committed answer-quality rubric and the three evaluation
 * contracts match the implementer-owned frozen specs: eight ordered evaluation
 * dimensions, ten ordered failure modes, four independent judgments, seven
 * deterministic structural machine checks, and the fixed human-review policy.
 * It also enforces the data-boundary contracts on the schemas themselves:
 * public case splits only, sealed-holdout manifests carry metadata only, and
 * no accuracy/score-style field is expressible.
 *
 * This proves structure and boundaries only. It cannot and does not judge the
 * semantic quality of any answer — that is the documented human-review duty.
 */

export type AnswerQualityFoundationCode =
  | 'FOUNDATION_SHAPE'
  | 'RUBRIC_SET'
  | 'FAILURE_SET'
  | 'JUDGMENT_SET'
  | 'MACHINE_HUMAN_BOUNDARY'
  | 'PRIVACY'
  | 'HOLDOUT_BOUNDARY'
  | 'FORBIDDEN_METRIC'
  | 'RUNTIME_BOUNDARY';

export interface AnswerQualityFoundationIssue {
  code: AnswerQualityFoundationCode;
  path: string;
}

export interface AnswerQualityFoundationResult {
  ok: boolean;
  dimensionCount: number;
  failureModeCount: number;
  contractCount: number;
  issues: readonly AnswerQualityFoundationIssue[];
}

export const ANSWER_QUALITY_DIMENSIONS = [
  'support-and-traceability',
  'mechanism-to-implication',
  'topic-specificity',
  'condition-and-caveat-fidelity',
  'cross-system-integrity',
  'restraint-and-boundaries',
  'presentation-cleanliness',
  'usefulness-without-invention',
] as const;

export const ANSWER_QUALITY_FAILURE_MODES = [
  'vague-prose',
  'term-dump',
  'unsupported-fact',
  'mechanism-leap',
  'cross-system-consensus-fabrication',
  'repeated-conclusion',
  'default-footer-clutter',
  'missing-material-condition',
  'jargon-without-concrete-implication',
  'unsupported-life-verdict',
] as const;

export const ANSWER_QUALITY_JUDGMENTS = [
  'meets',
  'needs-review',
  'does-not-meet',
  'not-applicable',
] as const;

export const ANSWER_QUALITY_MACHINE_CHECKS = [
  'contract-shape',
  'id-set-and-order',
  'privacy-field-exclusion',
  'public-split-boundary',
  'holdout-metadata-only',
  'forbidden-metric-exclusion',
  'runtime-isolation',
] as const;

export const ANSWER_QUALITY_HUMAN_REVIEW_POLICY = {
  minReviewers: {
    development: 1,
    adversarial: 2,
    'sealed-holdout': 2,
  },
  independentJudgmentThenReconcile: true,
  stableIdentifierOnly: true,
  aggregateScoresForbidden: true,
  criticalDimensionNoOffset: true,
} as const;

const RUBRIC_KEYS = [
  'contractVersion',
  'rubricId',
  'phase',
  'topic',
  'mode',
  'dimensions',
  'failureModes',
  'judgments',
  'machineCheckIds',
  'humanReviewPolicy',
  'exclusionPolicy',
];
const RUBRIC_CONTRACT_VERSION = 'answer-quality-rubric/v1';
const RUBRIC_ID = 'rubric:answer-quality:career-v1';
const RUBRIC_PHASE = 'IQ-0';
const RUBRIC_TOPIC = 'career';
const RUBRIC_MODE = 'human-reviewed-with-deterministic-structure';

const CASE_SCHEMA_ID = 'loom:eval/answer-quality-case/v1';
const CASE_SCHEMA_KEYS = [
  'contractVersion',
  'caseId',
  'split',
  'fixtureKind',
  'topic',
  'rubricId',
  'exclusionPolicy',
];
const CASE_SPLIT_ENUM = ['development', 'adversarial', 'regression'];

const HOLDOUT_SCHEMA_ID = 'loom:eval/sealed-holdout-manifest/v1';
const HOLDOUT_SCHEMA_KEYS = [
  'contractVersion',
  'setId',
  'version',
  'topic',
  'rubricId',
  'caseCount',
  'contentDigest',
  'accessLogDigest',
  'status',
  'retiredCaseCount',
  'custodianRole',
  'replacementRequired',
];
const HOLDOUT_STATUS_ENUM = ['planned', 'active', 'rotated', 'retired'];

const RUBRIC_SCHEMA_ID = 'loom:eval/answer-quality-rubric/v1';
const RUBRIC_SCHEMA_KEYS = RUBRIC_KEYS;

// Field names that must never appear as declared properties in the evaluation
// contracts or as keys in the rubric artifact: personal data, raw interaction
// content, model reasoning, reviewer prose and holdout payloads.
const FORBIDDEN_FIELD_NAMES = new Set([
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
  'questiontext',
  'chainofthought',
  'transcript',
  'messages',
  'chat',
  'apikey',
  'providerkey',
  'rawanswer',
  'readingdraft',
  'reviewer',
  'reviewernotes',
  'reviewername',
  'expectedanswer',
  'expectedboundary',
  'accesslog',
  'holdoutinput',
  'holdoutanswer',
]);

// Metric-style field names that would turn independent judgments into an
// aggregated score. They are forbidden as declared properties and keys.
const FORBIDDEN_METRIC_NAMES = new Set([
  'score',
  'weight',
  'percentage',
  'percent',
  'confidence',
  'accuracyrate',
  'rating',
  'total',
  'average',
  'passrate',
  'overall',
]);

// Runtime entry references that would mean the evaluation foundation is wired
// into a runtime path. The foundation stays development-only.
const RUNTIME_PATH_FRAGMENTS = ['packages/', 'skills/', 'scripts/dist', 'loom-chart'];

const DOT_ONLY_SEGMENT = /^\.+$/;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function add(
  issues: AnswerQualityFoundationIssue[],
  code: AnswerQualityFoundationCode,
  path: string,
): void {
  issues.push({ code, path });
}

/** Order-insensitive exact key-set equality, without sorting parsed input. */
function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  if (actual.length !== expected.length) return false;
  const seen = new Set(actual);
  return expected.every((key) => seen.has(key));
}

/**
 * Deep structural equality over JSON-shaped values. Object key order is
 * irrelevant; array order is preserved (the frozen sets are order-locked).
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

/** Recursively collect every object key and every string value of a document. */
function collectKeysAndStrings(value: unknown, keys: string[], strings: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectKeysAndStrings(entry, keys, strings));
    return;
  }
  const source = record(value);
  if (source === null) {
    if (typeof value === 'string') strings.push(value);
    return;
  }
  for (const [key, child] of Object.entries(source)) {
    keys.push(key);
    if (typeof child === 'string') strings.push(child);
    collectKeysAndStrings(child, keys, strings);
  }
}

function hasForbiddenFieldName(name: string): 'PRIVACY' | 'FORBIDDEN_METRIC' | null {
  const lowered = name.toLowerCase();
  if (FORBIDDEN_FIELD_NAMES.has(lowered)) return 'PRIVACY';
  if (FORBIDDEN_METRIC_NAMES.has(lowered)) return 'FORBIDDEN_METRIC';
  return null;
}

function hasRuntimePathReference(strings: readonly string[]): boolean {
  return strings.some((value) =>
    RUNTIME_PATH_FRAGMENTS.some((fragment) => value.toLowerCase().includes(fragment)),
  );
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

export interface AnswerQualityFoundationInputs {
  /** The committed rubric artifact (evals/fixtures/synthetic/iq0a-answer-quality-rubric.json). */
  rubric: unknown;
  /** The committed rubric schema (evals/contracts/answer-quality-rubric.schema.json). */
  rubricSchema: unknown;
  /** The committed case schema (evals/contracts/answer-quality-case.schema.json). */
  caseSchema: unknown;
  /** The committed holdout manifest schema (evals/contracts/sealed-holdout-manifest.schema.json). */
  holdoutManifestSchema: unknown;
}

/**
 * Verify the committed IQ-0A foundation against the implementer-owned frozen
 * specs. Structural and boundary proof only: it never judges the semantic
 * quality of any answer, never computes a score, and never activates a
 * runtime surface.
 */
export function verifyAnswerQualityFoundation(
  inputs: AnswerQualityFoundationInputs,
): AnswerQualityFoundationResult {
  const issues: AnswerQualityFoundationIssue[] = [];
  let dimensions = 0;
  let failureModes = 0;
  let contracts = 0;

  // --- Rubric artifact: shape, frozen sets, machine/human boundary ---------
  const rubric = record(inputs.rubric);
  if (rubric === null) {
    add(issues, 'FOUNDATION_SHAPE', '$.rubric');
    return { ok: false, dimensionCount: 0, failureModeCount: 0, contractCount: 0, issues };
  }

  // Privacy / metric / runtime scan of every key and string value first, so a
  // forbidden field is named even when the overall shape also drifted.
  const rubricKeys: string[] = [];
  const rubricStrings: string[] = [];
  collectKeysAndStrings(rubric, rubricKeys, rubricStrings);
  rubricKeys.forEach((key, index) => {
    const hit = hasForbiddenFieldName(key);
    if (hit !== null) add(issues, hit, `$.rubric.keys[${index}]`);
  });
  if (hasRuntimePathReference(rubricStrings)) {
    add(issues, 'RUNTIME_BOUNDARY', '$.rubric');
  }

  if (!exactKeys(rubric, RUBRIC_KEYS)) {
    add(issues, 'FOUNDATION_SHAPE', '$.rubric');
  }
  if (rubric.contractVersion !== RUBRIC_CONTRACT_VERSION) {
    add(issues, 'FOUNDATION_SHAPE', '$.rubric.contractVersion');
  }
  if (rubric.rubricId !== RUBRIC_ID) add(issues, 'FOUNDATION_SHAPE', '$.rubric.rubricId');
  if (rubric.phase !== RUBRIC_PHASE) add(issues, 'FOUNDATION_SHAPE', '$.rubric.phase');
  if (rubric.topic !== RUBRIC_TOPIC) add(issues, 'FOUNDATION_SHAPE', '$.rubric.topic');
  if (rubric.mode !== RUBRIC_MODE) add(issues, 'FOUNDATION_SHAPE', '$.rubric.mode');

  if (deepEquals(rubric.dimensions, ANSWER_QUALITY_DIMENSIONS)) {
    dimensions = ANSWER_QUALITY_DIMENSIONS.length;
  } else {
    add(issues, 'RUBRIC_SET', '$.rubric.dimensions');
  }
  if (deepEquals(rubric.failureModes, ANSWER_QUALITY_FAILURE_MODES)) {
    failureModes = ANSWER_QUALITY_FAILURE_MODES.length;
  } else {
    add(issues, 'FAILURE_SET', '$.rubric.failureModes');
  }
  if (!deepEquals(rubric.judgments, ANSWER_QUALITY_JUDGMENTS)) {
    add(issues, 'JUDGMENT_SET', '$.rubric.judgments');
  }
  if (!deepEquals(rubric.machineCheckIds, ANSWER_QUALITY_MACHINE_CHECKS)) {
    add(issues, 'MACHINE_HUMAN_BOUNDARY', '$.rubric.machineCheckIds');
  }
  if (!deepEquals(rubric.humanReviewPolicy, ANSWER_QUALITY_HUMAN_REVIEW_POLICY)) {
    add(issues, 'MACHINE_HUMAN_BOUNDARY', '$.rubric.humanReviewPolicy');
  }

  // --- The three evaluation contracts -------------------------------------
  const contractList: Array<{
    name: string;
    schema: unknown;
    id: string;
    keys: readonly string[];
  }> = [
    {
      name: 'rubricSchema',
      schema: inputs.rubricSchema,
      id: RUBRIC_SCHEMA_ID,
      keys: RUBRIC_SCHEMA_KEYS,
    },
    { name: 'caseSchema', schema: inputs.caseSchema, id: CASE_SCHEMA_ID, keys: CASE_SCHEMA_KEYS },
    {
      name: 'holdoutManifestSchema',
      schema: inputs.holdoutManifestSchema,
      id: HOLDOUT_SCHEMA_ID,
      keys: HOLDOUT_SCHEMA_KEYS,
    },
  ];

  for (const contract of contractList) {
    const path = `$.${contract.name}`;
    const schema = record(contract.schema);
    if (schema === null) {
      add(issues, 'FOUNDATION_SHAPE', path);
      continue;
    }

    // Privacy / metric / runtime scan of every declared key and string value
    // first, so a forbidden field is named even when the shape also drifted.
    const schemaKeys: string[] = [];
    const schemaStrings: string[] = [];
    collectKeysAndStrings(schema, schemaKeys, schemaStrings);
    schemaKeys.forEach((key, index) => {
      const hit = hasForbiddenFieldName(key);
      if (hit !== null) add(issues, hit, `${path}.keys[${index}]`);
    });
    if (hasRuntimePathReference(schemaStrings)) add(issues, 'RUNTIME_BOUNDARY', path);

    if (schema.$id !== contract.id) add(issues, 'FOUNDATION_SHAPE', `${path}.$id`);
    if (schema.additionalProperties !== false) {
      add(issues, 'FOUNDATION_SHAPE', `${path}.additionalProperties`);
    }
    const properties = record(schema.properties);
    if (properties === null || !exactKeys(properties, contract.keys)) {
      add(issues, 'FOUNDATION_SHAPE', `${path}.properties`);
      continue;
    }
    contracts += 1;
  }

  // --- Case schema: public splits only, sealed holdout not expressible ------
  const caseSchema = record(inputs.caseSchema);
  const caseProperties = caseSchema === null ? null : record(caseSchema.properties);
  if (caseProperties !== null) {
    const split = record(caseProperties.split);
    const splitEnum = split === null ? null : split.enum;
    if (!deepEquals(splitEnum, CASE_SPLIT_ENUM)) {
      add(issues, 'HOLDOUT_BOUNDARY', '$.caseSchema.properties.split.enum');
    }
    if (Array.isArray(splitEnum) && splitEnum.includes('sealed-holdout')) {
      add(issues, 'HOLDOUT_BOUNDARY', '$.caseSchema.properties.split.enum');
    }
    const fixtureKind = record(caseProperties.fixtureKind);
    if (fixtureKind === null || fixtureKind.const !== 'synthetic-technical') {
      add(issues, 'FOUNDATION_SHAPE', '$.caseSchema.properties.fixtureKind.const');
    }
    const topic = record(caseProperties.topic);
    if (topic === null || topic.const !== RUBRIC_TOPIC) {
      add(issues, 'FOUNDATION_SHAPE', '$.caseSchema.properties.topic.const');
    }
  }

  // --- Holdout manifest schema: metadata only, fixed lifecycle --------------
  const holdoutSchema = record(inputs.holdoutManifestSchema);
  const holdoutProperties = holdoutSchema === null ? null : record(holdoutSchema.properties);
  if (holdoutProperties !== null) {
    const status = record(holdoutProperties.status);
    const statusEnum = status === null ? null : status.enum;
    if (!deepEquals(statusEnum, HOLDOUT_STATUS_ENUM)) {
      add(issues, 'HOLDOUT_BOUNDARY', '$.holdoutManifestSchema.properties.status.enum');
    }
    for (const digestField of ['contentDigest', 'accessLogDigest'] as const) {
      const field = record(holdoutProperties[digestField]);
      const pattern = field === null ? undefined : field.pattern;
      if (typeof pattern !== 'string' || !pattern.startsWith('^sha256:')) {
        add(issues, 'HOLDOUT_BOUNDARY', `$.holdoutManifestSchema.properties.${digestField}`);
      }
    }
  }

  return {
    ok: issues.length === 0,
    dimensionCount: dimensions,
    failureModeCount: failureModes,
    contractCount: contracts,
    issues,
  };
}

// --- CLI: reads only the four committed foundation artifacts -----------------

const COMMITTED_ARTIFACTS = {
  rubric: 'evals/fixtures/synthetic/iq0a-answer-quality-rubric.json',
  rubricSchema: 'evals/contracts/answer-quality-rubric.schema.json',
  caseSchema: 'evals/contracts/answer-quality-case.schema.json',
  holdoutManifestSchema: 'evals/contracts/sealed-holdout-manifest.schema.json',
} as const;

function main(): void {
  if (process.argv.length > 2) {
    process.stderr.write(
      'Usage: node tools/eval/verify-answer-quality-foundation.ts\nThis verifier takes no arguments; it reads only the four committed foundation artifacts.\n',
    );
    process.exit(2);
  }
  let result: AnswerQualityFoundationResult;
  try {
    const inputs = {} as Record<keyof typeof COMMITTED_ARTIFACTS, unknown>;
    for (const [role, relativePath] of Object.entries(COMMITTED_ARTIFACTS)) {
      const text = readRepoTextFile(relativePath);
      if (text === null) {
        process.stderr.write('[FAIL] could not read a committed foundation artifact.\n');
        process.exit(1);
      }
      inputs[role as keyof typeof COMMITTED_ARTIFACTS] = JSON.parse(text);
    }
    result = verifyAnswerQualityFoundation(inputs as unknown as AnswerQualityFoundationInputs);
  } catch {
    process.stderr.write('[FAIL] could not read a committed foundation artifact.\n');
    process.exit(1);
  }
  for (const issue of result.issues) process.stdout.write(`[FAIL] ${issue.code} ${issue.path}\n`);
  if (!result.ok) process.exit(1);
  process.stdout.write(
    `IQ-0A foundation verified: ${result.dimensionCount} dimensions / ${result.failureModeCount} failure modes / ${result.contractCount} contracts\n`,
  );
}

const entry = process.argv[1];
if (entry !== undefined && entry === fileURLToPath(import.meta.url)) main();
