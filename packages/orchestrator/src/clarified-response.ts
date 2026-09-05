import { canonicalJson } from '@loom/contracts';
import { z } from 'zod';
import { ApprovedAnswerClaim } from '../../contracts/src/answer-claim.ts';
import { ClarificationPlanningInput } from '../../contracts/src/clarification-plan.ts';
import { ResponseClaimEligibility, ResponseView } from '../../contracts/src/response-view.ts';
import { planClarificationMateriality } from '../../interpret/src/clarification-materiality.ts';
import {
  projectResponseView,
  ResponseViewPlanningError,
  type ResponseViewVerificationResult,
} from '../../interpret/src/response-view.ts';

/**
 * IQ-3D package-layer machine surface. It chains the two frozen IQ-3 records —
 * clarification-plan/v1 and response-view/v1 — behind one fail-closed entry and
 * adds no contract version, command, narrator, persistence, or default-output
 * change. Engine entry, CLI, Skill, and bundle stay untouched; the records stay
 * transient and regenerable.
 */
const ClarifiedResponseSurfaceInput = z.strictObject({
  planningInput: ClarificationPlanningInput,
  approvedClaims: z.array(ApprovedAnswerClaim).min(1).max(20),
  claimEligibility: z.array(ResponseClaimEligibility).min(1).max(20),
});

export type ClarifiedResponseSurfaceInput = z.infer<typeof ClarifiedResponseSurfaceInput>;

/**
 * Builds the bounded narrator view from one bounded request. A request with an
 * unanswered material setting never produces a view: the surface fails closed
 * with `CLARIFICATION_REQUIRED` instead of guessing, defaulting, or degrading
 * on its own.
 */
export function buildClarifiedResponseView(rawInput: unknown) {
  const surfaceInput = ClarifiedResponseSurfaceInput.parse(rawInput);
  const plan = planClarificationMateriality(surfaceInput.planningInput);
  if (plan.status === 'requires-clarification') {
    throw new ResponseViewPlanningError('CLARIFICATION_REQUIRED');
  }
  return projectResponseView({
    clarificationPlan: plan,
    approvedClaims: surfaceInput.approvedClaims,
    claimEligibility: surfaceInput.claimEligibility,
  });
}

/**
 * Rebuilds the expected surface view from the same bounded input instead of
 * trusting the caller's view, so a projection cannot conceal a material caveat.
 * Failures are classified without echoing claims, caveats, or input values.
 */
export function verifyClarifiedResponseView(
  rawView: unknown,
  rawInput: unknown,
): ResponseViewVerificationResult {
  const parsedView = ResponseView.safeParse(rawView);
  if (!parsedView.success) {
    return { ok: false, issues: [{ code: 'VIEW_SHAPE', path: '$.responseView' }] };
  }

  let expected: ReturnType<typeof buildClarifiedResponseView>;
  try {
    expected = buildClarifiedResponseView(rawInput);
  } catch (error) {
    if (error instanceof ResponseViewPlanningError) {
      return { ok: false, issues: [{ code: 'VIEW_LINKAGE', path: '$.clarificationPlan' }] };
    }
    throw error;
  }

  return canonicalJson(parsedView.data) === canonicalJson(expected)
    ? { ok: true, issues: [] }
    : { ok: false, issues: [{ code: 'VIEW_LINKAGE', path: '$.responseView' }] };
}
