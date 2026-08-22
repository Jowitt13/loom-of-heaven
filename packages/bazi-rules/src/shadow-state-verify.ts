import { canonicalJson } from '@loom/contracts';
import {
  BAZI_SHADOW_STATE_CONTRACT_VERSION,
  BAZI_SHADOW_STATE_DEPENDENCIES,
  BAZI_SHADOW_STATE_INVALIDATIONS,
  BAZI_SHADOW_STATE_NODE_IDS,
  type BaziShadowStateNodeId,
} from './shadow-state.ts';

/** Stable, internal diagnostic categories; they are not user-facing copy. */
export type BaziShadowStateVerificationCode =
  | 'STATE_SHAPE'
  | 'CONTRACT_VERSION'
  | 'STATE_ID'
  | 'RESOLUTION'
  | 'SOURCE_PROFILE'
  | 'NODE_SET'
  | 'NODE_SHAPE'
  | 'NODE_LAYER'
  | 'DEPENDENCY'
  | 'INVALIDATION'
  | 'CHART_SOURCE'
  | 'COLLECTOR_LINK'
  | 'FORBIDDEN_FIELD';

export interface BaziShadowStateVerificationIssue {
  code: BaziShadowStateVerificationCode;
  path: string;
}

export interface BaziShadowStateVerificationResult {
  ok: boolean;
  issues: readonly BaziShadowStateVerificationIssue[];
}

type JsonRecord = Record<string, unknown>;

const TOP_LEVEL_KEYS = ['contractVersion', 'stateId', 'resolution', 'nodes'];
const RESOLUTION_KEYS = ['schemaVersion', 'engineVersion', 'sourceProfileIds'];
const NODE_KEYS = ['id', 'layer', 'dependsOn', 'invalidatedBy', 'value'];

// These fields either carry disallowed raw input/model material or attempt to
// smuggle a judgment/answer layer into the P0-B derived-structure contract.
const FORBIDDEN_KEYS = new Set([
  'originalinput',
  'localdate',
  'localtime',
  'timezone',
  'location',
  'latitude',
  'longitude',
  'requestid',
  'calculatedat',
  'name',
  'lifeevent',
  'prompt',
  'chainofthought',
  'transcript',
  'messages',
  'apikey',
  'providerkey',
  'rulejudgment',
  'schooljudgment',
  'answerclaim',
  'polarity',
]);

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function equalJson(left: unknown, right: unknown): boolean {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

function isExactKeySet(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expectedSorted = [...expected].sort();
  return (
    actual.length === expectedSorted.length &&
    actual.every((key, index) => key === expectedSorted[index])
  );
}

function isExactStringArray(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index])
  );
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function add(
  issues: BaziShadowStateVerificationIssue[],
  code: BaziShadowStateVerificationCode,
  path: string,
): void {
  issues.push({ code, path });
}

function inspectForbiddenFields(
  value: unknown,
  path: string,
  issues: BaziShadowStateVerificationIssue[],
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectForbiddenFields(entry, `${path}[${index}]`, issues));
    return;
  }
  const source = record(value);
  if (source === null) return;
  for (const [key, child] of Object.entries(source)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) add(issues, 'FORBIDDEN_FIELD', childPath);
    inspectForbiddenFields(child, childPath, issues);
  }
}

function collectorValue(
  node: JsonRecord | undefined,
  path: string,
  issues: BaziShadowStateVerificationIssue[],
): JsonRecord | null {
  const value = node === undefined ? null : record(node.value);
  if (value === null) add(issues, 'NODE_SHAPE', path);
  return value;
}

/**
 * Verify the bounded P0-B state contract and its four static derivation paths.
 *
 * This validates only engineering consistency. It deliberately does not decide
 * whether any traditional rule, strength condition, pattern, or life claim is
 * true. The verifier is internal and does not format user-facing diagnostics.
 */
export function verifyBaziShadowState(value: unknown): BaziShadowStateVerificationResult {
  const issues: BaziShadowStateVerificationIssue[] = [];
  const state = record(value);
  if (state === null) {
    add(issues, 'STATE_SHAPE', '$');
    return { ok: false, issues };
  }

  if (!isExactKeySet(state, TOP_LEVEL_KEYS)) add(issues, 'STATE_SHAPE', '$');
  if (state.contractVersion !== BAZI_SHADOW_STATE_CONTRACT_VERSION) {
    add(issues, 'CONTRACT_VERSION', '$.contractVersion');
  }
  if (!hasNonEmptyString(state.stateId)) add(issues, 'STATE_ID', '$.stateId');

  const resolution = record(state.resolution);
  if (resolution === null || !isExactKeySet(resolution, RESOLUTION_KEYS)) {
    add(issues, 'RESOLUTION', '$.resolution');
  } else {
    if (!hasNonEmptyString(resolution.schemaVersion)) {
      add(issues, 'RESOLUTION', '$.resolution.schemaVersion');
    }
    if (!hasNonEmptyString(resolution.engineVersion)) {
      add(issues, 'RESOLUTION', '$.resolution.engineVersion');
    }
    // No source profile has been admitted for this p0b contract.
    if (!isExactStringArray(resolution.sourceProfileIds, [])) {
      add(issues, 'SOURCE_PROFILE', '$.resolution.sourceProfileIds');
    }
  }

  inspectForbiddenFields(state, '$', issues);

  if (!Array.isArray(state.nodes) || state.nodes.length !== BAZI_SHADOW_STATE_NODE_IDS.length) {
    add(issues, 'NODE_SET', '$.nodes');
    return { ok: false, issues };
  }

  const nodes = state.nodes.map((entry) => record(entry));
  if (nodes.some((node) => node === null)) {
    add(issues, 'NODE_SHAPE', '$.nodes');
    return { ok: false, issues };
  }
  const concreteNodes = nodes as JsonRecord[];
  const byId = new Map<string, JsonRecord>();
  for (let index = 0; index < concreteNodes.length; index++) {
    const node = concreteNodes[index]!;
    const path = `$.nodes[${index}]`;
    if (!isExactKeySet(node, NODE_KEYS)) add(issues, 'NODE_SHAPE', path);
    const expectedId = BAZI_SHADOW_STATE_NODE_IDS[index];
    if (node.id !== expectedId || byId.has(String(node.id))) add(issues, 'NODE_SET', `${path}.id`);
    if (typeof node.id === 'string') byId.set(node.id, node);
    if (node.layer !== 'derived-structure') add(issues, 'NODE_LAYER', `${path}.layer`);
    if (
      typeof node.id === 'string' &&
      BAZI_SHADOW_STATE_NODE_IDS.includes(node.id as BaziShadowStateNodeId)
    ) {
      const id = node.id as BaziShadowStateNodeId;
      if (!isExactStringArray(node.dependsOn, BAZI_SHADOW_STATE_DEPENDENCIES[id])) {
        add(issues, 'DEPENDENCY', `${path}.dependsOn`);
      }
    } else {
      add(issues, 'DEPENDENCY', `${path}.dependsOn`);
    }
    if (!isExactStringArray(node.invalidatedBy, BAZI_SHADOW_STATE_INVALIDATIONS)) {
      add(issues, 'INVALIDATION', `${path}.invalidatedBy`);
    }
    if (record(node.value) === null) add(issues, 'NODE_SHAPE', `${path}.value`);
  }

  const directRoots = collectorValue(
    byId.get('bazi.shadow.direct-roots'),
    '$.nodes.direct-roots',
    issues,
  );
  const relationGeometry = collectorValue(
    byId.get('bazi.shadow.relation-geometry'),
    '$.nodes.relation-geometry',
    issues,
  );
  const strengthInputs = collectorValue(
    byId.get('bazi.shadow.strength-inputs'),
    '$.nodes.strength-inputs',
    issues,
  );
  const patternInputs = collectorValue(
    byId.get('bazi.shadow.pattern-inputs'),
    '$.nodes.pattern-inputs',
    issues,
  );

  const sources = [directRoots, relationGeometry, strengthInputs, patternInputs]
    .map((entry) => (entry === null ? null : record(entry.chartSource)))
    .filter((entry): entry is JsonRecord => entry !== null);
  if (
    sources.length !== BAZI_SHADOW_STATE_NODE_IDS.length ||
    !sources.every((source) => equalJson(source, sources[0]))
  ) {
    add(issues, 'CHART_SOURCE', '$.nodes.*.value.chartSource');
  }

  if (
    directRoots !== null &&
    strengthInputs !== null &&
    !equalJson(strengthInputs.directRoots, directRoots)
  ) {
    add(issues, 'COLLECTOR_LINK', '$.nodes.strength-inputs.value.directRoots');
  }
  if (relationGeometry !== null && patternInputs !== null) {
    const facts = Array.isArray(relationGeometry.facts) ? relationGeometry.facts : null;
    const expectedStemCombinations =
      facts === null
        ? null
        : facts.filter((fact) => record(fact)?.kind === 'stem-five-combination');
    if (
      expectedStemCombinations === null ||
      !equalJson(patternInputs.stemCombinations, expectedStemCombinations)
    ) {
      add(issues, 'COLLECTOR_LINK', '$.nodes.pattern-inputs.value.stemCombinations');
    }
  }

  return { ok: issues.length === 0, issues };
}
