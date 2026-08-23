import { type BaziShadowStateNodeId } from './shadow-state.ts';
import {
  type BaziShadowStateChangeCause,
  planBaziShadowStateInvalidation,
} from './shadow-state-invalidation.ts';
import { diffBaziShadowStates } from './shadow-state-diff.ts';

/** Internal P1-C contract for conservative reuse of verified P0-B projections. */
export const BAZI_SHADOW_STATE_REUSE_CONTRACT_VERSION = 'bazi-shadow-state-reuse/p1c';

export type BaziShadowStateReuseIssueCode = 'INVALIDATION_PLAN_INVALID' | 'STATE_DIFF_INVALID';

export interface BaziShadowStateReuseIssue {
  code: BaziShadowStateReuseIssueCode;
  /** Internal input path only; never a chart value or a user-facing diagnostic. */
  path: string;
}

export type BaziShadowStateRecomputeReason = 'invalidation-plan' | 'observed-diff';

/**
 * A conservative, internal-only reuse decision.
 *
 * It contains identifiers and field paths only. It never returns a chart,
 * collector value, rule judgment, answer claim, or narratable prose.
 */
export interface BaziShadowStateReuseDecision {
  contractVersion: typeof BAZI_SHADOW_STATE_REUSE_CONTRACT_VERSION;
  /** True only when the plan and structural comparison both permit reuse. */
  stateRecordReusable: boolean;
  /** Topic/lens or language/narrator can refresh a later projection, not this state. */
  projectionRefreshRequired: boolean;
  /** Fixed-order reasons why a new P0-B state must be projected. */
  recomputeReasons: readonly BaziShadowStateRecomputeReason[];
  /** Carried from the typed P1-A plan, not inferred from values. */
  invalidatedNodeIds: readonly BaziShadowStateNodeId[];
  /** Carried from P1-B as paths only, never old or new values. */
  changedResolutionPaths: readonly string[];
  /** Carried from P1-B in fixed node order. */
  changedNodeIds: readonly BaziShadowStateNodeId[];
}

export interface BaziShadowStateReuseResult {
  ok: boolean;
  decision: BaziShadowStateReuseDecision | null;
  issues: readonly BaziShadowStateReuseIssue[];
}

function projectionRefreshRequired(causes: readonly BaziShadowStateChangeCause[]): boolean {
  return causes.includes('topic-lens') || causes.includes('language-narrator');
}

/**
 * Coordinate P1-A invalidation and P1-B comparison without replacing either.
 *
 * A declared chart-affecting cause requires a fresh projection even when two
 * collector snapshots happen to compare equal. Conversely, an observed diff
 * prevents reuse when a caller omitted the corresponding typed cause. This is
 * a pure, transient guard; it neither persists a state nor schedules work.
 */
export function decideBaziShadowStateReuse(
  leftState: unknown,
  rightState: unknown,
  causes: unknown,
): BaziShadowStateReuseResult {
  const planResult = planBaziShadowStateInvalidation(leftState, causes);
  const diffResult = diffBaziShadowStates(leftState, rightState);
  const issues: BaziShadowStateReuseIssue[] = [];

  if (!planResult.ok) {
    for (const issue of planResult.issues) {
      issues.push({ code: 'INVALIDATION_PLAN_INVALID', path: `$.plan${issue.path}` });
    }
  }
  if (!diffResult.ok) {
    for (const issue of diffResult.issues) {
      issues.push({ code: 'STATE_DIFF_INVALID', path: `$.diff${issue.path}` });
    }
  }
  if (issues.length > 0) return { ok: false, decision: null, issues };

  const plan = planResult.plan!;
  const diff = diffResult.diff!;
  const recomputeReasons: BaziShadowStateRecomputeReason[] = [];
  if (!plan.stateRecordReusable) recomputeReasons.push('invalidation-plan');
  if (!diff.stateRecordEqual) recomputeReasons.push('observed-diff');

  return {
    ok: true,
    decision: {
      contractVersion: BAZI_SHADOW_STATE_REUSE_CONTRACT_VERSION,
      stateRecordReusable: recomputeReasons.length === 0,
      projectionRefreshRequired: projectionRefreshRequired(plan.causes),
      recomputeReasons,
      invalidatedNodeIds: plan.invalidatedNodeIds,
      changedResolutionPaths: diff.changedResolutionPaths,
      changedNodeIds: diff.changedNodeIds,
    },
    issues,
  };
}
