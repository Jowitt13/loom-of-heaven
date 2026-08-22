import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BaziChartResult } from '../../packages/contracts/src/bazi.ts';
import {
  BAZI_SHADOW_STATE_CONTRACT_VERSION,
  BAZI_SHADOW_STATE_INVALIDATIONS,
  projectBaziShadowState,
  type BaziShadowState,
  type BaziShadowStateNodeId,
  type ShadowStateInvalidationCause,
} from '../../packages/bazi-rules/src/shadow-state.ts';
import { verifyBaziShadowState } from '../../packages/bazi-rules/src/shadow-state-verify.ts';
import { canonicalSha256 } from './verify-eval-manifest.ts';

/** Stable diagnostics for the development-only synthetic shadow-state checker. */
export type ShadowStateIntegrityVerificationCode =
  | 'MANIFEST_SHAPE'
  | 'CHART_SHAPE'
  | 'PRIVACY'
  | 'SCOPE'
  | 'STATE_CONTRACT'
  | 'INTEGRITY'
  | 'INVALIDATION';

export interface ShadowStateIntegrityVerificationIssue {
  code: ShadowStateIntegrityVerificationCode;
  path: string;
}

export interface ShadowStateIntegrityVerificationResult {
  ok: boolean;
  issues: readonly ShadowStateIntegrityVerificationIssue[];
}

type JsonRecord = Record<string, unknown>;

const MANIFEST_KEYS = [
  'contractVersion',
  'fixtureId',
  'stateId',
  'stateContractVersion',
  'resolution',
  'stateDigest',
  'invalidationCases',
  'exclusionPolicy',
];
const RESOLUTION_KEYS = ['schemaVersion', 'engineVersion', 'sourceProfileIds'];
const INVALIDATION_CASE_KEYS = [
  'caseId',
  'cause',
  'expectedInvalidatedNodeIds',
  'stateRecordReusable',
];
const EVAL_INVALIDATION_CAUSES = [
  ...BAZI_SHADOW_STATE_INVALIDATIONS,
  'topic-lens',
  'language-narrator',
] as const;

type EvalInvalidationCause = (typeof EVAL_INVALIDATION_CAUSES)[number];

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

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const SYNTHETIC_FIXTURE_ID = /^synthetic:[a-z0-9][a-z0-9._-]*$/;
const OPAQUE_SYNTHETIC_STATE_ID = /^opaque-synthetic-[a-z0-9][a-z0-9._-]*$/;

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

function exactStrings(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index])
  );
}

function add(
  issues: ShadowStateIntegrityVerificationIssue[],
  code: ShadowStateIntegrityVerificationCode,
  path: string,
): void {
  issues.push({ code, path });
}

function inspectForbiddenFields(
  value: unknown,
  path: string,
  issues: ShadowStateIntegrityVerificationIssue[],
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

function isEvalInvalidationCause(value: unknown): value is EvalInvalidationCause {
  return (
    typeof value === 'string' && EVAL_INVALIDATION_CAUSES.includes(value as EvalInvalidationCause)
  );
}

function expectedInvalidatedNodeIds(
  state: BaziShadowState,
  cause: EvalInvalidationCause,
): readonly BaziShadowStateNodeId[] {
  if (!BAZI_SHADOW_STATE_INVALIDATIONS.includes(cause as ShadowStateInvalidationCause)) return [];
  return state.nodes
    .filter((node) => node.invalidatedBy.includes(cause as ShadowStateInvalidationCause))
    .map((node) => node.id);
}

function isSyntheticTechnicalChart(chart: ReturnType<typeof BaziChartResult.parse>): boolean {
  const pillars = [
    chart.pillars.year,
    chart.pillars.month,
    chart.pillars.day,
    chart.pillars.hour,
  ].filter((pillar) => pillar !== null);
  return (
    chart.provider.id === 'synthetic-provider' &&
    chart.dayBoundaryApplied === 'synthetic-technical' &&
    chart.luckCycle === null &&
    pillars.every((pillar) => pillar.naYin === 'synthetic-technical')
  );
}

/**
 * Rebuild one committed synthetic P0-B state and verify only its integrity
 * reference and declared invalidation table. This does not persist state,
 * run a chart calculation, execute a rule, or make a user-facing claim.
 */
export function verifySyntheticShadowStateIntegrity(
  manifestValue: unknown,
  chartValue: unknown,
): ShadowStateIntegrityVerificationResult {
  const issues: ShadowStateIntegrityVerificationIssue[] = [];
  inspectForbiddenFields(manifestValue, '$.manifest', issues);
  inspectForbiddenFields(chartValue, '$.chart', issues);

  const manifest = record(manifestValue);
  if (manifest === null || !exactKeys(manifest, MANIFEST_KEYS)) {
    add(issues, 'MANIFEST_SHAPE', '$.manifest');
    return { ok: false, issues };
  }

  if (manifest.contractVersion !== 'shadow-state-integrity-manifest/v1') {
    add(issues, 'MANIFEST_SHAPE', '$.manifest.contractVersion');
  }
  if (typeof manifest.fixtureId !== 'string' || !SYNTHETIC_FIXTURE_ID.test(manifest.fixtureId)) {
    add(issues, 'MANIFEST_SHAPE', '$.manifest.fixtureId');
  }
  if (typeof manifest.stateId !== 'string' || !OPAQUE_SYNTHETIC_STATE_ID.test(manifest.stateId)) {
    add(issues, 'MANIFEST_SHAPE', '$.manifest.stateId');
  }
  if (manifest.stateContractVersion !== BAZI_SHADOW_STATE_CONTRACT_VERSION) {
    add(issues, 'STATE_CONTRACT', '$.manifest.stateContractVersion');
  }
  if (typeof manifest.stateDigest !== 'string' || !SHA256.test(manifest.stateDigest)) {
    add(issues, 'INTEGRITY', '$.manifest.stateDigest');
  }
  if (
    !Array.isArray(manifest.exclusionPolicy) ||
    manifest.exclusionPolicy.length === 0 ||
    manifest.exclusionPolicy.some(
      (entry) => typeof entry !== 'string' || !/^[a-z][a-z0-9-]*$/.test(entry),
    )
  ) {
    add(issues, 'MANIFEST_SHAPE', '$.manifest.exclusionPolicy');
  }

  const resolution = record(manifest.resolution);
  if (
    resolution === null ||
    !exactKeys(resolution, RESOLUTION_KEYS) ||
    typeof resolution.schemaVersion !== 'string' ||
    resolution.schemaVersion.trim().length === 0 ||
    typeof resolution.engineVersion !== 'string' ||
    resolution.engineVersion.trim().length === 0 ||
    !exactStrings(resolution.sourceProfileIds, [])
  ) {
    add(issues, 'SCOPE', '$.manifest.resolution');
  }

  const parsed = BaziChartResult.safeParse(chartValue);
  if (!parsed.success) {
    add(issues, 'CHART_SHAPE', '$.chart');
    return { ok: false, issues };
  }
  if (!isSyntheticTechnicalChart(parsed.data)) add(issues, 'SCOPE', '$.chart');

  const state = projectBaziShadowState(parsed.data, {
    stateId: String(manifest.stateId),
    resolution: {
      schemaVersion: String(resolution?.schemaVersion),
      engineVersion: String(resolution?.engineVersion),
      sourceProfileIds: [],
    },
  });
  if (!verifyBaziShadowState(state).ok) add(issues, 'STATE_CONTRACT', '$.projection');
  if (manifest.stateDigest !== canonicalSha256(state))
    add(issues, 'INTEGRITY', '$.manifest.stateDigest');

  if (!Array.isArray(manifest.invalidationCases)) {
    add(issues, 'INVALIDATION', '$.manifest.invalidationCases');
  } else {
    const seen = new Set<EvalInvalidationCause>();
    manifest.invalidationCases.forEach((entry, index) => {
      const invalidationCase = record(entry);
      const path = `$.manifest.invalidationCases[${index}]`;
      if (invalidationCase === null || !exactKeys(invalidationCase, INVALIDATION_CASE_KEYS)) {
        add(issues, 'INVALIDATION', path);
        return;
      }
      const cause = invalidationCase.cause;
      if (!isEvalInvalidationCause(cause) || seen.has(cause)) {
        add(issues, 'INVALIDATION', `${path}.cause`);
        return;
      }
      seen.add(cause);
      if (invalidationCase.caseId !== `invalidation:synthetic:${cause}`) {
        add(issues, 'INVALIDATION', `${path}.caseId`);
      }
      const expected = expectedInvalidatedNodeIds(state, cause);
      if (!exactStrings(invalidationCase.expectedInvalidatedNodeIds, expected)) {
        add(issues, 'INVALIDATION', `${path}.expectedInvalidatedNodeIds`);
      }
      if (invalidationCase.stateRecordReusable !== (expected.length === 0)) {
        add(issues, 'INVALIDATION', `${path}.stateRecordReusable`);
      }
    });
    if (
      !exactStrings(
        manifest.invalidationCases.map((entry) => record(entry)?.cause),
        EVAL_INVALIDATION_CAUSES,
      ) ||
      seen.size !== EVAL_INVALIDATION_CAUSES.length
    ) {
      add(issues, 'INVALIDATION', '$.manifest.invalidationCases');
    }
  }

  return { ok: issues.length === 0, issues };
}

function parseArgs(args: readonly string[]): { manifest: string; chart: string } | null {
  const manifestIndex = args.indexOf('--manifest');
  const chartIndex = args.indexOf('--chart');
  const manifest = manifestIndex >= 0 ? args[manifestIndex + 1] : undefined;
  const chart = chartIndex >= 0 ? args[chartIndex + 1] : undefined;
  return typeof manifest === 'string' && typeof chart === 'string' ? { manifest, chart } : null;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    process.stderr.write(
      'Usage: node tools/eval/verify-shadow-state-integrity.ts --manifest <file> --chart <file>\n',
    );
    process.exit(2);
  }
  let manifest: unknown;
  let chart: unknown;
  try {
    manifest = JSON.parse(readFileSync(args.manifest, 'utf8'));
    chart = JSON.parse(readFileSync(args.chart, 'utf8'));
  } catch {
    process.stderr.write('[FAIL] could not read a JSON synthetic evaluation artifact.\n');
    process.exit(1);
  }
  const result = verifySyntheticShadowStateIntegrity(manifest, chart);
  for (const issue of result.issues) process.stdout.write(`[FAIL] ${issue.code} ${issue.path}\n`);
  if (!result.ok) process.exit(1);
  process.stdout.write(
    `[PASS] synthetic shadow-state integrity valid: ${resolve(args.manifest)} + ${resolve(args.chart)}\n`,
  );
}

const entry = process.argv[1];
if (entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url)) main();
