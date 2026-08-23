import {
  BAZI_SHADOW_STATE_NODE_IDS,
  type BaziShadowState,
  type BaziShadowStateNodeId,
} from './shadow-state.ts';
import { verifyBaziShadowState } from './shadow-state-verify.ts';

/** Internal P1-B contract for a bounded comparison of two verified P0-B states. */
export const BAZI_SHADOW_STATE_DIFF_CONTRACT_VERSION = 'bazi-shadow-state-diff/p1b';

export type BaziShadowStateDiffCode = 'LEFT_STATE_INVALID' | 'RIGHT_STATE_INVALID';

export interface BaziShadowStateDiffIssue {
  code: BaziShadowStateDiffCode;
  path: '$.left' | '$.right';
}

/** A changed field path relative to one node's internal `value` object. */
export interface BaziShadowStateNodeDiff {
  nodeId: BaziShadowStateNodeId;
  /** Paths only: the comparison never returns either side's raw values. */
  changedPaths: readonly string[];
}

/**
 * A deterministic, internal-only structural comparison.
 *
 * `stateId` is deliberately omitted: it is caller-provided opaque identity,
 * not a semantic property of a shadow projection. The result is neither a
 * persisted cache record nor a scheduler, rule verdict, or answer payload.
 */
export interface BaziShadowStateDiff {
  contractVersion: typeof BAZI_SHADOW_STATE_DIFF_CONTRACT_VERSION;
  /** True when resolution and all four collector values are structurally equal. */
  stateRecordEqual: boolean;
  /** Changed paths under `resolution`, with no old or new values. */
  changedResolutionPaths: readonly string[];
  /** Changed nodes in the fixed P0-B declaration order. */
  changedNodeIds: readonly BaziShadowStateNodeId[];
  /** Unchanged nodes in the same fixed declaration order. */
  unchangedNodeIds: readonly BaziShadowStateNodeId[];
  /** Per-node changed paths, relative to the collector value. */
  changedNodePaths: readonly BaziShadowStateNodeDiff[];
}

export interface BaziShadowStateDiffResult {
  ok: boolean;
  diff: BaziShadowStateDiff | null;
  issues: readonly BaziShadowStateDiffIssue[];
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function equalJson(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((entry, index) => equalJson(entry, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && equalJson(left[key], right[key]))
  );
}

/**
 * Return stable paths only. Array length changes stop at the array to avoid
 * assigning a misleading identity to shifted positions.
 */
function changedPaths(left: unknown, right: unknown, path: string): string[] {
  if (equalJson(left, right)) return [];
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return [path];
    return left.flatMap((entry, index) => changedPaths(entry, right[index], `${path}[${index}]`));
  }
  if (isRecord(left) && isRecord(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    return keys.flatMap((key) => {
      if (!(key in left) || !(key in right)) return [`${path}.${key}`];
      return changedPaths(left[key], right[key], `${path}.${key}`);
    });
  }
  return [path];
}

/**
 * Compare two already-verified P0-B projections without emitting their values.
 * Invalid inputs receive no partial comparison, so callers cannot mistake an
 * incomplete record for a legitimate structural transition.
 */
export function diffBaziShadowStates(
  leftValue: unknown,
  rightValue: unknown,
): BaziShadowStateDiffResult {
  const issues: BaziShadowStateDiffIssue[] = [];
  if (!verifyBaziShadowState(leftValue).ok)
    issues.push({ code: 'LEFT_STATE_INVALID', path: '$.left' });
  if (!verifyBaziShadowState(rightValue).ok) {
    issues.push({ code: 'RIGHT_STATE_INVALID', path: '$.right' });
  }
  if (issues.length > 0) return { ok: false, diff: null, issues };

  const left = leftValue as BaziShadowState;
  const right = rightValue as BaziShadowState;
  const changedResolutionPaths = changedPaths(left.resolution, right.resolution, 'resolution');
  const changedNodePaths = BAZI_SHADOW_STATE_NODE_IDS.flatMap((nodeId, index) => {
    const paths = changedPaths(left.nodes[index]!.value, right.nodes[index]!.value, 'value');
    return paths.length === 0 ? [] : [{ nodeId, changedPaths: paths }];
  });
  const changedNodeIds = changedNodePaths.map((node) => node.nodeId);
  const changed = new Set<BaziShadowStateNodeId>(changedNodeIds);

  return {
    ok: true,
    diff: {
      contractVersion: BAZI_SHADOW_STATE_DIFF_CONTRACT_VERSION,
      stateRecordEqual: changedResolutionPaths.length === 0 && changedNodeIds.length === 0,
      changedResolutionPaths,
      changedNodeIds,
      unchangedNodeIds: BAZI_SHADOW_STATE_NODE_IDS.filter((nodeId) => !changed.has(nodeId)),
      changedNodePaths,
    },
    issues,
  };
}
