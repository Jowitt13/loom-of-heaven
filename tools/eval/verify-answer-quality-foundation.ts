import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * IQ-0A/IQ-0A-R foundation verifier — development-only, offline, deterministic.
 *
 * It checks that the committed answer-quality rubric and the six evaluation
 * contracts match the implementer-owned frozen specs: eight ordered evaluation
 * dimensions, ten ordered failure modes, four independent judgments, seven
 * deterministic structural machine checks, the fixed human-review policy, and
 * the IQ-0A-R case/review carrier contracts (v2 case carrier, sanitized
 * visible-answer artifact, structured human-review record). It also enforces
 * the data-boundary contracts on the schemas themselves: public case splits
 * only, sealed-holdout manifests carry metadata only, no accuracy/score-style
 * field is expressible, and the v1 identity-only case contract stays
 * superseded-before-first-case without silent semantic rewrites.
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
  | 'RUNTIME_BOUNDARY'
  | 'VERSION_BOUNDARY'
  | 'CASE_CARRIER'
  | 'ANSWER_ARTIFACT_BOUNDARY'
  | 'REVIEW_RECORD_BOUNDARY';

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

// --- IQ-0A-R: case/review carrier registries (implementation-owned) ---------

const CASE_V2_SCHEMA_ID = 'loom:eval/answer-quality-case/v2';
const CASE_V2_CONTRACT_VERSION = 'answer-quality-case/v2';
const CASE_V2_KEYS = [
  'contractVersion',
  'caseId',
  'split',
  'fixtureKind',
  'topic',
  'rubricId',
  'question',
  'scenario',
  'evidenceArtifacts',
  'answerArtifact',
  'evaluationPlan',
  'exclusionPolicy',
];
const QUESTION_INTENT_IDS = [
  'career-direction',
  'role-fit',
  'work-environment',
  'career-change',
  'collaboration',
  'timing-scope',
  'strengths-and-tradeoffs',
  'insufficient-evidence',
] as const;
const SCENARIO_CHALLENGE_IDS = [
  'ordinary',
  'source-blocked',
  'conflicting-signals',
  'leading-user',
  'missing-condition',
  'insufficient-evidence',
  'presentation-stress',
] as const;
const SCENARIO_TIME_RELIABILITY = ['exact', 'approximate', 'unknown', 'not-relevant'] as const;
const SCENARIO_SYSTEM_SCOPE = ['single-system', 'multi-system'] as const;
const EVIDENCE_ARTIFACT_KINDS = [
  'answer-plan',
  'public-result',
  'synthetic-evidence-bundle',
] as const;

const VISIBLE_SCHEMA_ID = 'loom:eval/answer-quality-visible-artifact/v1';
const VISIBLE_CONTRACT_VERSION = 'answer-quality-visible-artifact/v1';
const VISIBLE_SCHEMA_KEYS = [
  'contractVersion',
  'artifactId',
  'caseId',
  'topic',
  'role',
  'visibleText',
  'producerClass',
  'pipelineRevision',
  'rulesetRefs',
  'sourceArtifactDigests',
  'sanitization',
  'exclusionPolicy',
];
const VISIBLE_ROLES = ['legacy-baseline', 'candidate', 'accepted-reference', 'regression'] as const;
const PRODUCER_CLASSES = [
  'current-pipeline',
  'human-authored-synthetic',
  'host-assisted-sanitized',
] as const;

const REVIEW_SCHEMA_ID = 'loom:eval/answer-quality-review/v1';
const REVIEW_CONTRACT_VERSION = 'answer-quality-review/v1';
const REVIEW_SCHEMA_KEYS = [
  'contractVersion',
  'reviewId',
  'reviewKind',
  'caseId',
  'answerArtifactId',
  'reviewedArtifactDigest',
  'rubricId',
  'reviewerId',
  'reviewRound',
  'judgments',
  'failureModeIds',
  'boundaryFindingIds',
  'disposition',
  'sourceReviewIds',
  'exclusionPolicy',
];
const REVIEW_KINDS = ['independent', 'reconciliation'] as const;
const REVIEW_DISPOSITIONS = ['accept', 'revise', 'reject', 'reconciliation-required'] as const;
const REVIEWER_ID_PATTERN = '^reviewer:anon:[a-f0-9]{16}$';
const CRITICAL_DIMENSION_IDS = [
  'support-and-traceability',
  'condition-and-caveat-fidelity',
  'cross-system-integrity',
  'restraint-and-boundaries',
] as const;
const BOUNDARY_IDS = [
  'claim-support-resolves',
  'mechanism-adjacent-to-implication',
  'topic-scope-respected',
  'material-caveat-retained',
  'unrelated-warning-omitted',
  'cross-system-separation-preserved',
  'unsupported-life-fact-excluded',
  'deterministic-verdict-excluded',
  'default-footer-excluded',
  'audit-metadata-hidden',
  'insufficient-evidence-degrades',
  'automatic-followup-excluded',
] as const;

// The v1 identity-only case contract must never grow content-bearing fields;
// v2 is the only place where question/scenario/evidence/answer/plan live.
const V1_FORBIDDEN_CONTENT_FIELDS = [
  'question',
  'scenario',
  'evidenceartifacts',
  'answerartifact',
  'evaluationplan',
];

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

/** The frozen enum of a schema property, or null when absent/malformed. */
function enumOf(properties: JsonRecord, name: string): readonly unknown[] | null {
  const field = record(properties[name]);
  if (field === null) return null;
  const values = field.enum;
  return Array.isArray(values) ? values : null;
}

/** The frozen const of a schema property, or undefined when absent/malformed. */
function constOf(properties: JsonRecord, name: string): unknown {
  const field = record(properties[name]);
  return field === null ? undefined : field.const;
}

/** The maxLength of a schema property, or null when absent/malformed. */
function maxLengthOf(properties: JsonRecord, name: string): number | null {
  const field = record(properties[name]);
  if (field === null) return null;
  const value = field.maxLength;
  return typeof value === 'number' ? value : null;
}

/** The .properties record of a nested sub-schema, or null. */
function propsOf(subSchema: unknown): JsonRecord | null {
  const source = record(subSchema);
  return source === null ? null : record(source.properties);
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
  /** The committed v1 identity-only case schema (evals/contracts/answer-quality-case.schema.json). */
  caseSchema: unknown;
  /** The committed holdout manifest schema (evals/contracts/sealed-holdout-manifest.schema.json). */
  holdoutManifestSchema: unknown;
  /** The committed v2 case carrier schema (evals/contracts/answer-quality-case-v2.schema.json). */
  caseV2Schema: unknown;
  /** The committed visible-artifact schema (evals/contracts/answer-quality-visible-artifact.schema.json). */
  visibleArtifactSchema: unknown;
  /** The committed review record schema (evals/contracts/answer-quality-review.schema.json). */
  reviewSchema: unknown;
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

  // --- The six evaluation contracts ---------------------------------------
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
    {
      name: 'caseV2Schema',
      schema: inputs.caseV2Schema,
      id: CASE_V2_SCHEMA_ID,
      keys: CASE_V2_KEYS,
    },
    {
      name: 'visibleArtifactSchema',
      schema: inputs.visibleArtifactSchema,
      id: VISIBLE_SCHEMA_ID,
      keys: VISIBLE_SCHEMA_KEYS,
    },
    {
      name: 'reviewSchema',
      schema: inputs.reviewSchema,
      id: REVIEW_SCHEMA_ID,
      keys: REVIEW_SCHEMA_KEYS,
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

  // --- Case schema (v1): identity-only, public splits, no content fields ----
  const caseSchema = record(inputs.caseSchema);
  const caseProperties = caseSchema === null ? null : record(caseSchema.properties);
  if (caseProperties !== null) {
    // VERSION_BOUNDARY: the v1 identity-only contract must never grow the
    // content-bearing fields that belong to the v2 case carrier.
    for (const lowered of Object.keys(caseProperties)) {
      if (V1_FORBIDDEN_CONTENT_FIELDS.includes(lowered)) {
        add(issues, 'VERSION_BOUNDARY', `$.caseSchema.properties.${lowered}`);
      }
    }
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

  // --- Case carrier (v2): question/scenario/evidence/answer/evaluation plan --
  const caseV2Schema = record(inputs.caseV2Schema);
  const caseV2Id = caseV2Schema === null ? null : caseV2Schema.$id;
  const caseV2Properties = caseV2Schema === null ? null : record(caseV2Schema.properties);
  if (caseV2Properties !== null) {
    if (constOf(caseV2Properties, 'contractVersion') !== CASE_V2_CONTRACT_VERSION) {
      add(issues, 'VERSION_BOUNDARY', '$.caseV2Schema.properties.contractVersion.const');
    }
    if (caseV2Id === CASE_SCHEMA_ID) {
      add(issues, 'VERSION_BOUNDARY', '$.caseV2Schema.$id');
    }
    const question = record(caseV2Properties.question);
    const questionProps = question === null ? null : propsOf(question);
    if (questionProps !== null) {
      if (!deepEquals(enumOf(questionProps, 'intentId'), QUESTION_INTENT_IDS)) {
        add(issues, 'CASE_CARRIER', '$.caseV2Schema.properties.question.properties.intentId.enum');
      }
      const textMaxLength = maxLengthOf(questionProps, 'syntheticText');
      if (textMaxLength === null || textMaxLength > 300 || textMaxLength < 1) {
        add(
          issues,
          'CASE_CARRIER',
          '$.caseV2Schema.properties.question.properties.syntheticText.maxLength',
        );
      }
      if (constOf(questionProps, 'syntheticOnly') !== true) {
        add(
          issues,
          'CASE_CARRIER',
          '$.caseV2Schema.properties.question.properties.syntheticOnly.const',
        );
      }
      if (constOf(questionProps, 'rawUserPromptExcluded') !== true) {
        add(
          issues,
          'CASE_CARRIER',
          '$.caseV2Schema.properties.question.properties.rawUserPromptExcluded.const',
        );
      }
    } else {
      add(issues, 'CASE_CARRIER', '$.caseV2Schema.properties.question');
    }

    const scenario = record(caseV2Properties.scenario);
    const scenarioProps = scenario === null ? null : propsOf(scenario);
    if (scenarioProps !== null) {
      if (!deepEquals(enumOf(scenarioProps, 'timeReliability'), SCENARIO_TIME_RELIABILITY)) {
        add(
          issues,
          'CASE_CARRIER',
          '$.caseV2Schema.properties.scenario.properties.timeReliability.enum',
        );
      }
      if (!deepEquals(enumOf(scenarioProps, 'systemScope'), SCENARIO_SYSTEM_SCOPE)) {
        add(
          issues,
          'CASE_CARRIER',
          '$.caseV2Schema.properties.scenario.properties.systemScope.enum',
        );
      }
      const challengeIds = record(scenarioProps.challengeIds);
      if (
        challengeIds === null ||
        !deepEquals(enumOf(challengeIds, 'items'), SCENARIO_CHALLENGE_IDS)
      ) {
        add(
          issues,
          'CASE_CARRIER',
          '$.caseV2Schema.properties.scenario.properties.challengeIds.items.enum',
        );
      }
      if (challengeIds === null || challengeIds.uniqueItems !== true) {
        add(
          issues,
          'CASE_CARRIER',
          '$.caseV2Schema.properties.scenario.properties.challengeIds.uniqueItems',
        );
      }
    } else {
      add(issues, 'CASE_CARRIER', '$.caseV2Schema.properties.scenario');
    }

    const evidenceArtifacts = record(caseV2Properties.evidenceArtifacts);
    const evidenceItems =
      evidenceArtifacts === null ? null : propsOf(evidenceArtifacts.items ?? null);
    if (evidenceArtifacts === null || evidenceItems === null) {
      add(issues, 'CASE_CARRIER', '$.caseV2Schema.properties.evidenceArtifacts.items');
    } else {
      if (evidenceArtifacts.uniqueItems !== true) {
        add(issues, 'CASE_CARRIER', '$.caseV2Schema.properties.evidenceArtifacts.uniqueItems');
      }
      if (!exactKeys(evidenceItems, ['artifactId', 'artifactKind', 'repoPath', 'digest'])) {
        add(issues, 'CASE_CARRIER', '$.caseV2Schema.properties.evidenceArtifacts.items');
      }
      if (!deepEquals(enumOf(evidenceItems, 'artifactKind'), EVIDENCE_ARTIFACT_KINDS)) {
        add(
          issues,
          'CASE_CARRIER',
          '$.caseV2Schema.properties.evidenceArtifacts.items.properties.artifactKind',
        );
      }
      const repoPath = record(evidenceItems.repoPath);
      const repoPattern = repoPath === null ? undefined : repoPath.pattern;
      if (
        typeof repoPattern !== 'string' ||
        repoPattern !== '^evals/fixtures/synthetic/[a-z0-9][a-z0-9._-]*\\.json$'
      ) {
        add(
          issues,
          'CASE_CARRIER',
          '$.caseV2Schema.properties.evidenceArtifacts.items.properties.repoPath',
        );
      }
      const digest = record(evidenceItems.digest);
      const digestPattern = digest === null ? undefined : digest.pattern;
      if (typeof digestPattern !== 'string' || !digestPattern.startsWith('^sha256:')) {
        add(
          issues,
          'CASE_CARRIER',
          '$.caseV2Schema.properties.evidenceArtifacts.items.properties.digest',
        );
      }
    }

    const answerArtifact = record(caseV2Properties.answerArtifact);
    const answerArtifactProps = answerArtifact === null ? null : propsOf(answerArtifact);
    if (answerArtifactProps !== null) {
      if (
        !exactKeys(answerArtifactProps, ['artifactId', 'contractVersion', 'repoPath', 'digest'])
      ) {
        add(issues, 'CASE_CARRIER', '$.caseV2Schema.properties.answerArtifact.properties');
      }
      if (constOf(answerArtifactProps, 'contractVersion') !== VISIBLE_CONTRACT_VERSION) {
        add(
          issues,
          'CASE_CARRIER',
          '$.caseV2Schema.properties.answerArtifact.properties.contractVersion.const',
        );
      }
      const repoPath = record(answerArtifactProps.repoPath);
      const repoPattern = repoPath === null ? undefined : repoPath.pattern;
      if (
        typeof repoPattern !== 'string' ||
        repoPattern !== '^evals/corpus/public/career/[a-z0-9][a-z0-9._-]*\\.json$'
      ) {
        add(issues, 'CASE_CARRIER', '$.caseV2Schema.properties.answerArtifact.properties.repoPath');
      }
      const digest = record(answerArtifactProps.digest);
      const digestPattern = digest === null ? undefined : digest.pattern;
      if (typeof digestPattern !== 'string' || !digestPattern.startsWith('^sha256:')) {
        add(issues, 'CASE_CARRIER', '$.caseV2Schema.properties.answerArtifact.properties.digest');
      }
    } else {
      add(issues, 'CASE_CARRIER', '$.caseV2Schema.properties.answerArtifact');
    }

    const evaluationPlan = record(caseV2Properties.evaluationPlan);
    const evaluationPlanProps = evaluationPlan === null ? null : propsOf(evaluationPlan);
    if (evaluationPlanProps !== null) {
      // dimensionIds / criticalDimensionIds / boundaryIds use a single-value
      // enum to pin the exact ordered array; unwrap the enum wrapper.
      const pinnedArray = (name: string): readonly unknown[] | null => {
        const values = enumOf(evaluationPlanProps, name);
        return values !== null && values.length === 1 && Array.isArray(values[0])
          ? (values[0] as readonly unknown[])
          : null;
      };
      const dimensionIds = pinnedArray('dimensionIds');
      if (dimensionIds === null || !deepEquals(dimensionIds, ANSWER_QUALITY_DIMENSIONS)) {
        add(
          issues,
          'CASE_CARRIER',
          '$.caseV2Schema.properties.evaluationPlan.properties.dimensionIds',
        );
      }
      const criticalIds = pinnedArray('criticalDimensionIds');
      if (criticalIds === null || !deepEquals(criticalIds, CRITICAL_DIMENSION_IDS)) {
        add(
          issues,
          'CASE_CARRIER',
          '$.caseV2Schema.properties.evaluationPlan.properties.criticalDimensionIds',
        );
      }
      const boundaryIds = pinnedArray('boundaryIds');
      if (boundaryIds === null || !deepEquals(boundaryIds, BOUNDARY_IDS)) {
        add(
          issues,
          'CASE_CARRIER',
          '$.caseV2Schema.properties.evaluationPlan.properties.boundaryIds',
        );
      }
      const targetFailureModeIds = record(evaluationPlanProps.targetFailureModeIds);
      const failureEnum =
        targetFailureModeIds === null ? null : enumOf(targetFailureModeIds, 'items');
      if (failureEnum === null || !deepEquals(failureEnum, ANSWER_QUALITY_FAILURE_MODES)) {
        add(
          issues,
          'CASE_CARRIER',
          '$.caseV2Schema.properties.evaluationPlan.properties.targetFailureModeIds',
        );
      }
      if (constOf(evaluationPlanProps, 'humanReviewRequired') !== true) {
        add(
          issues,
          'CASE_CARRIER',
          '$.caseV2Schema.properties.evaluationPlan.properties.humanReviewRequired.const',
        );
      }
    } else {
      add(issues, 'CASE_CARRIER', '$.caseV2Schema.properties.evaluationPlan');
    }
  } else {
    add(issues, 'CASE_CARRIER', '$.caseV2Schema');
  }

  // --- Visible-answer artifact: sanitized final prose only -------------------
  const visibleSchema = record(inputs.visibleArtifactSchema);
  const visibleProperties = visibleSchema === null ? null : record(visibleSchema.properties);
  if (visibleProperties !== null) {
    const visibleText = record(visibleProperties.visibleText);
    const textMin = visibleText === null ? undefined : visibleText.minLength;
    const textMax = visibleText === null ? undefined : visibleText.maxLength;
    if (typeof textMin !== 'number' || textMin < 1) {
      add(
        issues,
        'ANSWER_ARTIFACT_BOUNDARY',
        '$.visibleArtifactSchema.properties.visibleText.minLength',
      );
    }
    if (typeof textMax !== 'number' || textMax > 12000 || textMax < 1) {
      add(
        issues,
        'ANSWER_ARTIFACT_BOUNDARY',
        '$.visibleArtifactSchema.properties.visibleText.maxLength',
      );
    }
    if (!deepEquals(enumOf(visibleProperties, 'role'), VISIBLE_ROLES)) {
      add(issues, 'ANSWER_ARTIFACT_BOUNDARY', '$.visibleArtifactSchema.properties.role.enum');
    }
    if (!deepEquals(enumOf(visibleProperties, 'producerClass'), PRODUCER_CLASSES)) {
      add(
        issues,
        'ANSWER_ARTIFACT_BOUNDARY',
        '$.visibleArtifactSchema.properties.producerClass.enum',
      );
    }
    const pipelineRevision = record(visibleProperties.pipelineRevision);
    const revisionPattern = pipelineRevision === null ? undefined : pipelineRevision.pattern;
    if (typeof revisionPattern !== 'string' || revisionPattern !== '^[a-f0-9]{40}$') {
      add(
        issues,
        'ANSWER_ARTIFACT_BOUNDARY',
        '$.visibleArtifactSchema.properties.pipelineRevision.pattern',
      );
    }
    const sanitization = record(visibleProperties.sanitization);
    const sanitizationProps = sanitization === null ? null : propsOf(sanitization);
    if (sanitizationProps === null) {
      add(issues, 'ANSWER_ARTIFACT_BOUNDARY', '$.visibleArtifactSchema.properties.sanitization');
    } else {
      for (const attestation of [
        'syntheticInputOnly',
        'rawTranscriptExcluded',
        'rawPromptExcluded',
        'modelReasoningExcluded',
        'personalDataExcluded',
      ]) {
        if (constOf(sanitizationProps, attestation) !== true) {
          add(
            issues,
            'ANSWER_ARTIFACT_BOUNDARY',
            `$.visibleArtifactSchema.properties.sanitization.properties.${attestation}`,
          );
        }
      }
    }
    const rulesetRefs = record(visibleProperties.rulesetRefs);
    if (rulesetRefs === null || rulesetRefs.minItems !== 1 || rulesetRefs.uniqueItems !== true) {
      add(
        issues,
        'ANSWER_ARTIFACT_BOUNDARY',
        '$.visibleArtifactSchema.properties.rulesetRefs.minItems',
      );
    }
    const sourceArtifactDigests = record(visibleProperties.sourceArtifactDigests);
    if (
      sourceArtifactDigests === null ||
      sourceArtifactDigests.minItems !== 1 ||
      sourceArtifactDigests.uniqueItems !== true
    ) {
      add(
        issues,
        'ANSWER_ARTIFACT_BOUNDARY',
        '$.visibleArtifactSchema.properties.sourceArtifactDigests',
      );
    }
  } else {
    add(issues, 'ANSWER_ARTIFACT_BOUNDARY', '$.visibleArtifactSchema');
  }

  // --- Review record: structured, reconciliation-aware, prose-free ----------
  const reviewSchema = record(inputs.reviewSchema);
  const reviewAllOf = reviewSchema === null ? null : reviewSchema.allOf;
  const reviewProperties = reviewSchema === null ? null : record(reviewSchema.properties);
  if (reviewProperties !== null) {
    const reviewContractVersion = record(reviewProperties.contractVersion);
    if (reviewContractVersion === null || reviewContractVersion.const !== REVIEW_CONTRACT_VERSION) {
      add(issues, 'REVIEW_RECORD_BOUNDARY', '$.reviewSchema.properties.contractVersion.const');
    }
    if (!deepEquals(enumOf(reviewProperties, 'reviewKind'), REVIEW_KINDS)) {
      add(issues, 'REVIEW_RECORD_BOUNDARY', '$.reviewSchema.properties.reviewKind.enum');
    }
    if (!deepEquals(enumOf(reviewProperties, 'disposition'), REVIEW_DISPOSITIONS)) {
      add(issues, 'REVIEW_RECORD_BOUNDARY', '$.reviewSchema.properties.disposition.enum');
    }
    const reviewerId = record(reviewProperties.reviewerId);
    const reviewerPattern = reviewerId === null ? undefined : reviewerId.pattern;
    if (reviewerPattern !== REVIEWER_ID_PATTERN) {
      add(issues, 'REVIEW_RECORD_BOUNDARY', '$.reviewSchema.properties.reviewerId.pattern');
    }
    const judgments = record(reviewProperties.judgments);
    if (judgments === null) {
      add(issues, 'REVIEW_RECORD_BOUNDARY', '$.reviewSchema.properties.judgments');
    } else {
      const prefixItems = Array.isArray(judgments.prefixItems) ? judgments.prefixItems : [];
      if (prefixItems.length !== ANSWER_QUALITY_DIMENSIONS.length) {
        add(issues, 'REVIEW_RECORD_BOUNDARY', '$.reviewSchema.properties.judgments.prefixItems');
      } else {
        prefixItems.forEach((entry, index) => {
          const entryRecord = record(entry);
          const entryProperties = entryRecord === null ? null : record(entryRecord.properties);
          if (entryProperties === null) {
            add(
              issues,
              'REVIEW_RECORD_BOUNDARY',
              `$.reviewSchema.properties.judgments.prefixItems[${index}]`,
            );
            return;
          }
          if (constOf(entryProperties, 'dimensionId') !== ANSWER_QUALITY_DIMENSIONS[index]) {
            add(
              issues,
              'REVIEW_RECORD_BOUNDARY',
              `$.reviewSchema.properties.judgments.prefixItems[${index}].dimensionId`,
            );
          }
          if (!deepEquals(enumOf(entryProperties, 'judgment'), ANSWER_QUALITY_JUDGMENTS)) {
            add(
              issues,
              'REVIEW_RECORD_BOUNDARY',
              `$.reviewSchema.properties.judgments.prefixItems[${index}].judgment.enum`,
            );
          }
        });
      }
      if (judgments.items !== false || judgments.minItems !== 8 || judgments.maxItems !== 8) {
        add(issues, 'REVIEW_RECORD_BOUNDARY', '$.reviewSchema.properties.judgments.bounds');
      }
    }
    const failureModeIds = record(reviewProperties.failureModeIds);
    const failureEnum = failureModeIds === null ? null : enumOf(failureModeIds, 'items');
    if (failureEnum === null || !deepEquals(failureEnum, ANSWER_QUALITY_FAILURE_MODES)) {
      add(issues, 'REVIEW_RECORD_BOUNDARY', '$.reviewSchema.properties.failureModeIds.items.enum');
    }
    const boundaryFindingIds = record(reviewProperties.boundaryFindingIds);
    const boundaryEnum = boundaryFindingIds === null ? null : enumOf(boundaryFindingIds, 'items');
    if (boundaryEnum === null || !deepEquals(boundaryEnum, BOUNDARY_IDS)) {
      add(
        issues,
        'REVIEW_RECORD_BOUNDARY',
        '$.reviewSchema.properties.boundaryFindingIds.items.enum',
      );
    }
    const allOf = Array.isArray(reviewAllOf) ? reviewAllOf : [];
    if (
      allOf.length !== 2 ||
      !allOf.every(
        (entry) =>
          record(entry) !== null &&
          record(entry)!.if !== undefined &&
          record(entry)!.then !== undefined,
      )
    ) {
      add(issues, 'REVIEW_RECORD_BOUNDARY', '$.reviewSchema.allOf');
    } else {
      const allOfText = JSON.stringify(allOf);
      if (!allOfText.includes('"maxItems":0') || !allOfText.includes('"minItems":2')) {
        add(issues, 'REVIEW_RECORD_BOUNDARY', '$.reviewSchema.allOf.sourceReviewIds');
      }
    }
    const sourceReviewIds = record(reviewProperties.sourceReviewIds);
    if (sourceReviewIds === null || sourceReviewIds.uniqueItems !== true) {
      add(
        issues,
        'REVIEW_RECORD_BOUNDARY',
        '$.reviewSchema.properties.sourceReviewIds.uniqueItems',
      );
    }
  } else {
    add(issues, 'REVIEW_RECORD_BOUNDARY', '$.reviewSchema');
  }

  return {
    ok: issues.length === 0,
    dimensionCount: dimensions,
    failureModeCount: failureModes,
    contractCount: contracts,
    issues,
  };
}

// --- CLI: reads only the seven committed foundation artifacts ---------------

const COMMITTED_ARTIFACTS = {
  rubric: 'evals/fixtures/synthetic/iq0a-answer-quality-rubric.json',
  rubricSchema: 'evals/contracts/answer-quality-rubric.schema.json',
  caseSchema: 'evals/contracts/answer-quality-case.schema.json',
  holdoutManifestSchema: 'evals/contracts/sealed-holdout-manifest.schema.json',
  caseV2Schema: 'evals/contracts/answer-quality-case-v2.schema.json',
  visibleArtifactSchema: 'evals/contracts/answer-quality-visible-artifact.schema.json',
  reviewSchema: 'evals/contracts/answer-quality-review.schema.json',
} as const;

function main(): void {
  if (process.argv.length > 2) {
    process.stderr.write(
      'Usage: node tools/eval/verify-answer-quality-foundation.ts\nThis verifier takes no arguments; it reads only the seven committed foundation artifacts.\n',
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
    `IQ-0 foundation verified: ${result.dimensionCount} dimensions / ${result.failureModeCount} failure modes / ${result.contractCount} contracts\n`,
  );
}

const entry = process.argv[1];
if (entry !== undefined && entry === fileURLToPath(import.meta.url)) main();
