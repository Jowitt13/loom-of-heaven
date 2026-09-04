import { canonicalJson } from '@loom/contracts';
import {
  RESPONSE_VIEW_CONTRACT_VERSION,
  ResponseView,
  ResponseViewPlanningInput,
  type MaterialCaveatId,
  type ResponseClaimSensitivity,
  type ResponseView as ResponseViewValue,
} from '../../contracts/src/response-view.ts';
import type { ClarificationPlan, DegradationCode } from '../../contracts/src/clarification-plan.ts';
import type { ApprovedAnswerClaim } from '../../contracts/src/answer-claim.ts';

export type ResponseViewPlanningErrorCode =
  | 'CLARIFICATION_REQUIRED'
  | 'SETTING_RESOLUTION'
  | 'TOPIC_SCOPE_MISMATCH'
  | 'SYSTEM_SCOPE_MISMATCH'
  | 'NO_ELIGIBLE_APPROVED_CLAIMS'
  | 'VIEW_SHAPE'
  | 'VIEW_LINKAGE';

export class ResponseViewPlanningError extends Error {
  constructor(readonly code: ResponseViewPlanningErrorCode) {
    super(code);
    this.name = 'ResponseViewPlanningError';
  }
}

const DEGRADATION_BY_SENSITIVITY: Readonly<Record<ResponseClaimSensitivity, DegradationCode>> = {
  'time-sensitive': 'omit-time-sensitive-claims',
  timing: 'omit-timing-claims',
  'ruleset-variant-sensitive': 'omit-ruleset-variant-sensitive-claims',
};

function resolvedValue(
  plan: ClarificationPlan,
  settingId: 'topic-intent' | 'response-depth' | 'system-scope',
  prefix: 'topic:' | 'depth:' | 'system:',
): string {
  const setting = plan.confirmedSettings.find((entry) => entry.settingId === settingId);
  if (setting?.state !== 'confirmed' || setting.valueId === undefined) {
    throw new ResponseViewPlanningError('SETTING_RESOLUTION');
  }
  if (!setting.valueId.startsWith(prefix)) {
    throw new ResponseViewPlanningError('SETTING_RESOLUTION');
  }
  return setting.valueId.slice(prefix.length);
}

function claimConstraintMaterialCaveats(
  claims: readonly ApprovedAnswerClaim[],
): MaterialCaveatId[] {
  return claims.flatMap((claim) =>
    claim.constraintRefs
      .filter((reference) => reference.kind === 'caveat' || reference.kind === 'warning')
      .map(
        (reference) =>
          `claim-constraint:${claim.claimId}:${reference.kind}:${reference.index}` as MaterialCaveatId,
      ),
  );
}

function clarificationMaterialCaveats(plan: ClarificationPlan): MaterialCaveatId[] {
  return [
    ...plan.clarificationNoteCodes.map(
      (noteCode) => `clarification-note:${noteCode}` as MaterialCaveatId,
    ),
    ...plan.degradationCodes.map(
      (degradationCode) => `degradation:${degradationCode}` as MaterialCaveatId,
    ),
  ];
}

function shouldOmitClaim(
  sensitivities: readonly ResponseClaimSensitivity[],
  plan: ClarificationPlan,
): boolean {
  const degradations = new Set(plan.degradationCodes);
  return sensitivities.some((sensitivity) =>
    degradations.has(DEGRADATION_BY_SENSITIVITY[sensitivity]),
  );
}

/**
 * Projects a bounded internal narrator view from an already-resolved
 * clarification plan and deterministic-path-approved claims. This is neither
 * visible prose nor a runtime integration surface.
 */
export function projectResponseView(rawInput: unknown): ResponseViewValue {
  const input = ResponseViewPlanningInput.parse(rawInput);
  const plan = input.clarificationPlan;
  if (plan.status === 'requires-clarification') {
    throw new ResponseViewPlanningError('CLARIFICATION_REQUIRED');
  }

  const topic = resolvedValue(plan, 'topic-intent', 'topic:');
  const requestedDepth = resolvedValue(plan, 'response-depth', 'depth:');
  const system = resolvedValue(plan, 'system-scope', 'system:');
  const retainedClaims = input.approvedClaims.filter((claim, index) => {
    if (claim.topic !== topic) throw new ResponseViewPlanningError('TOPIC_SCOPE_MISMATCH');
    if (claim.system !== system) throw new ResponseViewPlanningError('SYSTEM_SCOPE_MISMATCH');
    return !shouldOmitClaim(input.claimEligibility[index]!.sensitivities, plan);
  });

  if (retainedClaims.length === 0) {
    throw new ResponseViewPlanningError('NO_ELIGIBLE_APPROVED_CLAIMS');
  }

  const materialCaveatIds = [
    ...clarificationMaterialCaveats(plan),
    ...claimConstraintMaterialCaveats(retainedClaims),
  ];
  return ResponseView.parse({
    contractVersion: RESPONSE_VIEW_CONTRACT_VERSION,
    clarificationStatus: plan.status,
    topic,
    requestedDepth,
    system,
    approvedClaimIds: retainedClaims.map((claim) => claim.claimId),
    materialCaveatIds,
    allowedContentCategories: [
      'conclusion',
      'mechanism-and-implication',
      ...(materialCaveatIds.length === 0 ? [] : ['material-caveat']),
      ...(requestedDepth === 'brief' ? [] : ['practical-options']),
    ],
    auditAvailability: 'explicit-request-only',
    transient: true,
    regenerable: true,
  });
}

export interface ResponseViewVerificationResult {
  ok: boolean;
  issues: readonly { code: 'VIEW_SHAPE' | 'VIEW_LINKAGE'; path: string }[];
}

/**
 * Rebuilds the expected projection rather than trusting a caller-supplied
 * response view. Diagnostics never echo claims, caveats, or input values.
 */
export function verifyResponseView(
  rawView: unknown,
  rawInput: unknown,
): ResponseViewVerificationResult {
  const parsedView = ResponseView.safeParse(rawView);
  if (!parsedView.success) {
    return { ok: false, issues: [{ code: 'VIEW_SHAPE', path: '$.responseView' }] };
  }

  let expected: ResponseViewValue;
  try {
    expected = projectResponseView(rawInput);
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
