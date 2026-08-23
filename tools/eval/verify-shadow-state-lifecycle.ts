import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BaziChartResult, canonicalJson } from '../../packages/contracts/src/index.ts';
import {
  BAZI_SHADOW_STATE_CONTRACT_VERSION,
  BAZI_SHADOW_STATE_NODE_IDS,
  projectBaziShadowState,
  type BaziShadowState,
} from '../../packages/bazi-rules/src/shadow-state.ts';
import {
  BAZI_SHADOW_STATE_CHANGE_CAUSES,
  type BaziShadowStateChangeCause,
} from '../../packages/bazi-rules/src/shadow-state-invalidation.ts';
import {
  BAZI_SHADOW_STATE_REUSE_CONTRACT_VERSION,
  decideBaziShadowStateReuse,
  type BaziShadowStateReuseDecision,
} from '../../packages/bazi-rules/src/shadow-state-reuse.ts';
import { verifySyntheticShadowStateIntegrity } from './verify-shadow-state-integrity.ts';

/** Stable diagnostics for the development-only P2-A lifecycle checker. */
export type ShadowStateLifecycleVerificationCode =
  'MATRIX_SHAPE' | 'PRIVACY' | 'STATE_LINKAGE' | 'CASE_SET' | 'DECISION';

export interface ShadowStateLifecycleVerificationIssue {
  code: ShadowStateLifecycleVerificationCode;
  path: string;
}

export interface ShadowStateLifecycleVerificationResult {
  ok: boolean;
  issues: readonly ShadowStateLifecycleVerificationIssue[];
}

type JsonRecord = Record<string, unknown>;
type RightStateVariant = 'identical' | 'month-primary-cleared' | 'engine-version-changed';

const MATRIX_KEYS = [
  'contractVersion',
  'fixtureId',
  'mode',
  'stateContractVersion',
  'stateDigest',
  'cases',
  'exclusionPolicy',
];
const CASE_KEYS = ['caseId', 'causes', 'rightStateVariant', 'expected'];
const EXPECTED_KEYS = [
  'stateRecordReusable',
  'projectionRefreshRequired',
  'recomputeReasons',
  'invalidatedNodeIds',
  'changedResolutionPaths',
  'changedNodeIds',
];
const CASE_IDS = [
  'unchanged',
  'input-chart',
  'settings',
  'engine-provider',
  'ruleset',
  'source-profile',
  'topic-lens',
  'language-narrator',
  'observed-structure',
  'observed-resolution',
  'declared-and-observed',
] as const;
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
  issues: ShadowStateLifecycleVerificationIssue[],
  code: ShadowStateLifecycleVerificationCode,
  path: string,
): void {
  issues.push({ code, path });
}

function inspectForbiddenFields(
  value: unknown,
  path: string,
  issues: ShadowStateLifecycleVerificationIssue[],
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

function exactStrings(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index])
  );
}

function isCause(value: unknown): value is BaziShadowStateChangeCause {
  return (
    typeof value === 'string' &&
    BAZI_SHADOW_STATE_CHANGE_CAUSES.includes(value as BaziShadowStateChangeCause)
  );
}

function isVariant(value: unknown): value is RightStateVariant {
  return (
    value === 'identical' || value === 'month-primary-cleared' || value === 'engine-version-changed'
  );
}

function expectedDecision(
  value: unknown,
): Omit<BaziShadowStateReuseDecision, 'contractVersion'> | null {
  const expected = record(value);
  if (
    expected === null ||
    !exactKeys(expected, EXPECTED_KEYS) ||
    typeof expected.stateRecordReusable !== 'boolean' ||
    typeof expected.projectionRefreshRequired !== 'boolean' ||
    !Array.isArray(expected.recomputeReasons) ||
    expected.recomputeReasons.some(
      (reason) => reason !== 'invalidation-plan' && reason !== 'observed-diff',
    ) ||
    !Array.isArray(expected.invalidatedNodeIds) ||
    expected.invalidatedNodeIds.some(
      (nodeId) =>
        typeof nodeId !== 'string' ||
        !BAZI_SHADOW_STATE_NODE_IDS.includes(nodeId as (typeof BAZI_SHADOW_STATE_NODE_IDS)[number]),
    ) ||
    !Array.isArray(expected.changedResolutionPaths) ||
    expected.changedResolutionPaths.some(
      (path) => typeof path !== 'string' || !/^resolution\.[a-zA-Z0-9_.\[\]-]+$/.test(path),
    ) ||
    !Array.isArray(expected.changedNodeIds) ||
    expected.changedNodeIds.some(
      (nodeId) =>
        typeof nodeId !== 'string' ||
        !BAZI_SHADOW_STATE_NODE_IDS.includes(nodeId as (typeof BAZI_SHADOW_STATE_NODE_IDS)[number]),
    )
  ) {
    return null;
  }
  return expected as Omit<BaziShadowStateReuseDecision, 'contractVersion'>;
}

function projectState(
  chartValue: unknown,
  manifest: JsonRecord,
  variant: RightStateVariant,
): BaziShadowState | null {
  const chart = JSON.parse(JSON.stringify(chartValue)) as JsonRecord;
  const resolution = record(manifest.resolution);
  if (resolution === null) return null;
  let engineVersion = resolution.engineVersion;
  if (variant === 'month-primary-cleared') {
    const pillars = record(chart.pillars);
    const month = pillars === null ? null : record(pillars.month);
    const hiddenStems =
      month === null || !Array.isArray(month.hiddenStems) ? null : month.hiddenStems;
    const primary = hiddenStems?.[0];
    if (record(primary) === null) return null;
    (primary as JsonRecord).primary = false;
  }
  if (variant === 'engine-version-changed')
    engineVersion = 'synthetic-engine/p2a-resolution-change';
  const parsed = BaziChartResult.safeParse(chart);
  if (!parsed.success || typeof engineVersion !== 'string') return null;
  return projectBaziShadowState(parsed.data, {
    stateId: 'opaque-synthetic-p2a-lifecycle',
    resolution: {
      schemaVersion: String(resolution.schemaVersion),
      engineVersion,
      sourceProfileIds: [],
    },
  });
}

function publicDecision(
  decision: BaziShadowStateReuseDecision,
): Omit<BaziShadowStateReuseDecision, 'contractVersion'> {
  const { contractVersion: _contractVersion, ...publicFields } = decision;
  return publicFields;
}

/**
 * Verify the committed synthetic P2-A lifecycle matrix against P1-A/B/C.
 * This is a local regression check only: it persists nothing, invokes no model,
 * runs no chart provider, and exposes no runtime or user-facing surface.
 */
export function verifySyntheticShadowStateLifecycle(
  matrixValue: unknown,
  stateManifestValue: unknown,
  chartValue: unknown,
): ShadowStateLifecycleVerificationResult {
  const issues: ShadowStateLifecycleVerificationIssue[] = [];
  for (const [path, value] of [
    ['$.matrix', matrixValue],
    ['$.stateManifest', stateManifestValue],
    ['$.chart', chartValue],
  ] as const) {
    inspectForbiddenFields(value, path, issues);
  }

  const matrix = record(matrixValue);
  const stateManifest = record(stateManifestValue);
  if (matrix === null || !exactKeys(matrix, MATRIX_KEYS)) {
    add(issues, 'MATRIX_SHAPE', '$.matrix');
    return { ok: false, issues };
  }
  if (matrix.contractVersion !== 'shadow-state-lifecycle-matrix/v1') {
    add(issues, 'MATRIX_SHAPE', '$.matrix.contractVersion');
  }
  if (typeof matrix.fixtureId !== 'string' || !SYNTHETIC_FIXTURE_ID.test(matrix.fixtureId)) {
    add(issues, 'MATRIX_SHAPE', '$.matrix.fixtureId');
  }
  if (matrix.mode !== 'deterministic-local-only') add(issues, 'MATRIX_SHAPE', '$.matrix.mode');
  if (matrix.stateContractVersion !== BAZI_SHADOW_STATE_CONTRACT_VERSION) {
    add(issues, 'MATRIX_SHAPE', '$.matrix.stateContractVersion');
  }
  if (typeof matrix.stateDigest !== 'string' || !SHA256.test(matrix.stateDigest)) {
    add(issues, 'MATRIX_SHAPE', '$.matrix.stateDigest');
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
  if (
    stateManifest === null ||
    stateManifest.fixtureId !== matrix.fixtureId ||
    stateManifest.stateDigest !== matrix.stateDigest ||
    stateManifest.stateContractVersion !== matrix.stateContractVersion
  ) {
    add(issues, 'STATE_LINKAGE', '$.matrix');
  }

  const left = stateManifest === null ? null : projectState(chartValue, stateManifest, 'identical');
  if (left === null) add(issues, 'STATE_LINKAGE', '$.chart');

  if (!Array.isArray(matrix.cases) || matrix.cases.length !== CASE_IDS.length) {
    add(issues, 'CASE_SET', '$.matrix.cases');
    return { ok: false, issues };
  }

  matrix.cases.forEach((entry, index) => {
    const lifecycleCase = record(entry);
    const path = `$.matrix.cases[${index}]`;
    const expectedCaseId = `lifecycle:synthetic:${CASE_IDS[index]}`;
    if (lifecycleCase === null || !exactKeys(lifecycleCase, CASE_KEYS)) {
      add(issues, 'CASE_SET', path);
      return;
    }
    if (lifecycleCase.caseId !== expectedCaseId) add(issues, 'CASE_SET', `${path}.caseId`);
    if (
      !Array.isArray(lifecycleCase.causes) ||
      lifecycleCase.causes.some((cause) => !isCause(cause))
    ) {
      add(issues, 'CASE_SET', `${path}.causes`);
      return;
    }
    const causes = lifecycleCase.causes as BaziShadowStateChangeCause[];
    const normalized = BAZI_SHADOW_STATE_CHANGE_CAUSES.filter((cause) => causes.includes(cause));
    if (!exactStrings(causes, normalized) || new Set(causes).size !== causes.length) {
      add(issues, 'CASE_SET', `${path}.causes`);
    }
    if (!isVariant(lifecycleCase.rightStateVariant)) {
      add(issues, 'CASE_SET', `${path}.rightStateVariant`);
      return;
    }
    const expected = expectedDecision(lifecycleCase.expected);
    if (expected === null) {
      add(issues, 'CASE_SET', `${path}.expected`);
      return;
    }
    if (left === null) return;
    const right = projectState(chartValue, stateManifest!, lifecycleCase.rightStateVariant);
    if (right === null) {
      add(issues, 'STATE_LINKAGE', `${path}.rightStateVariant`);
      return;
    }
    const result = decideBaziShadowStateReuse(left, right, causes);
    if (
      !result.ok ||
      result.decision === null ||
      result.decision.contractVersion !== BAZI_SHADOW_STATE_REUSE_CONTRACT_VERSION ||
      canonicalJson(publicDecision(result.decision)) !== canonicalJson(expected)
    ) {
      add(issues, 'DECISION', `${path}.expected`);
    }
  });

  return { ok: issues.length === 0, issues };
}

interface CliArgs {
  matrix: string;
  stateManifest: string;
  chart: string;
}

function parseArgs(args: readonly string[]): CliArgs | null {
  const option = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const matrix = option('--matrix');
  const stateManifest = option('--state-manifest');
  const chart = option('--chart');
  return typeof matrix === 'string' &&
    typeof stateManifest === 'string' &&
    typeof chart === 'string'
    ? { matrix, stateManifest, chart }
    : null;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    process.stderr.write(
      'Usage: node tools/eval/verify-shadow-state-lifecycle.ts --matrix <file> --state-manifest <file> --chart <file>\n',
    );
    process.exit(2);
  }
  let result: ShadowStateLifecycleVerificationResult;
  try {
    result = verifySyntheticShadowStateLifecycle(
      JSON.parse(readFileSync(args.matrix, 'utf8')),
      JSON.parse(readFileSync(args.stateManifest, 'utf8')),
      JSON.parse(readFileSync(args.chart, 'utf8')),
    );
  } catch {
    process.stderr.write('[FAIL] could not read a JSON synthetic evaluation artifact.\n');
    process.exit(1);
  }
  for (const issue of result.issues) process.stdout.write(`[FAIL] ${issue.code} ${issue.path}\n`);
  if (!result.ok) process.exit(1);
  process.stdout.write(
    `[PASS] synthetic shadow-state lifecycle matrix valid: ${resolve(args.matrix)}\n`,
  );
}

const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)) main();
