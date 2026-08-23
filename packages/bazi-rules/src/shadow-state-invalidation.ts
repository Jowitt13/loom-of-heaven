import {
  BAZI_SHADOW_STATE_INVALIDATIONS,
  BAZI_SHADOW_STATE_NODE_IDS,
  type BaziShadowState,
  type BaziShadowStateNodeId,
  type ShadowStateInvalidationCause,
} from './shadow-state.ts';
import { verifyBaziShadowState } from './shadow-state-verify.ts';

/** Internal P1-A contract for planning a change against a verified P0-B state. */
export const BAZI_SHADOW_STATE_INVALIDATION_CONTRACT_VERSION = 'bazi-shadow-state-invalidation/p1a';

/**
 * P0-B has five chart-affecting causes. P0-F adds two projection-only causes:
 * they can require a new answer projection, but never recalculate this state.
 */
export const BAZI_SHADOW_STATE_CHANGE_CAUSES = [
  ...BAZI_SHADOW_STATE_INVALIDATIONS,
  'topic-lens',
  'language-narrator',
] as const;

export type BaziShadowStateChangeCause = (typeof BAZI_SHADOW_STATE_CHANGE_CAUSES)[number];

export type BaziShadowStateInvalidationCode = 'STATE_INVALID' | 'CAUSE_SET';

export interface BaziShadowStateInvalidationIssue {
  code: BaziShadowStateInvalidationCode;
  path: string;
}

/**
 * A deterministic change plan for the already-projected P0-B state.
 * It is not a persisted state, cache, dynamic scheduler, rule verdict, or prose.
 */
export interface BaziShadowStateInvalidationPlan {
  contractVersion: typeof BAZI_SHADOW_STATE_INVALIDATION_CONTRACT_VERSION;
  /** Unique causes, normalized to the fixed declaration order. */
  causes: readonly BaziShadowStateChangeCause[];
  /** False precisely when one or more retained P0-B nodes become stale. */
  stateRecordReusable: boolean;
  invalidatedNodeIds: readonly BaziShadowStateNodeId[];
  retainedNodeIds: readonly BaziShadowStateNodeId[];
}

export interface BaziShadowStateInvalidationResult {
  ok: boolean;
  plan: BaziShadowStateInvalidationPlan | null;
  issues: readonly BaziShadowStateInvalidationIssue[];
}

function isChangeCause(value: unknown): value is BaziShadowStateChangeCause {
  return (
    typeof value === 'string' &&
    BAZI_SHADOW_STATE_CHANGE_CAUSES.includes(value as BaziShadowStateChangeCause)
  );
}

function isChartAffecting(
  cause: BaziShadowStateChangeCause,
): cause is ShadowStateInvalidationCause {
  return BAZI_SHADOW_STATE_INVALIDATIONS.includes(cause as ShadowStateInvalidationCause);
}

/**
 * Convert typed change causes into the exact P0-B node set that becomes stale.
 * The state is verified before inspecting it, the source value is never mutated,
 * and presentation-only causes intentionally retain every structural node.
 */
export function planBaziShadowStateInvalidation(
  stateValue: unknown,
  causesValue: unknown,
): BaziShadowStateInvalidationResult {
  const issues: BaziShadowStateInvalidationIssue[] = [];
  if (!verifyBaziShadowState(stateValue).ok) {
    issues.push({ code: 'STATE_INVALID', path: '$.state' });
  }
  if (!Array.isArray(causesValue)) {
    issues.push({ code: 'CAUSE_SET', path: '$.causes' });
  } else {
    causesValue.forEach((cause, index) => {
      if (!isChangeCause(cause)) issues.push({ code: 'CAUSE_SET', path: `$.causes[${index}]` });
    });
  }
  if (issues.length > 0) return { ok: false, plan: null, issues };

  const causes = BAZI_SHADOW_STATE_CHANGE_CAUSES.filter((cause) =>
    (causesValue as unknown[]).includes(cause),
  );
  const state = stateValue as BaziShadowState;
  const invalidatedNodeIds = state.nodes
    .filter((node) =>
      node.invalidatedBy.some(
        (invalidation) => isChartAffecting(invalidation) && causes.includes(invalidation),
      ),
    )
    .map((node) => node.id);
  const invalidated = new Set<BaziShadowStateNodeId>(invalidatedNodeIds);
  const retainedNodeIds = BAZI_SHADOW_STATE_NODE_IDS.filter((nodeId) => !invalidated.has(nodeId));

  return {
    ok: true,
    plan: {
      contractVersion: BAZI_SHADOW_STATE_INVALIDATION_CONTRACT_VERSION,
      causes,
      stateRecordReusable: invalidatedNodeIds.length === 0,
      invalidatedNodeIds,
      retainedNodeIds,
    },
    issues,
  };
}
