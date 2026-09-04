import { z } from 'zod';
import { ChartSystem } from './birth-input.ts';
import { ClarificationPlan, ResponseDepth } from './clarification-plan.ts';
import { InterpretationTopic } from './interpretation.ts';
import { ApprovedAnswerClaim } from './answer-claim.ts';

/**
 * Internal-only IQ-3C contracts. They are deliberately excluded from the
 * package's public index until a separately admitted runtime slice exists.
 */
export const RESPONSE_VIEW_CONTRACT_VERSION = 'response-view/v1';

const ApprovedClaimId = z
  .string()
  .regex(/^approved-claim:fact-\d+$/, 'approved claim ids must derive from one fact id');

const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;

export const ResponseClaimSensitivity = z.enum([
  'time-sensitive',
  'timing',
  'ruleset-variant-sensitive',
]);
export type ResponseClaimSensitivity = z.infer<typeof ResponseClaimSensitivity>;

/**
 * A bounded, internal classification used only to remove already-approved
 * claims when the clarification plan has recorded a matching degradation.
 * It never provides a rule judgment, visible prose, or an arbitrary label.
 */
export const ResponseClaimEligibility = z.strictObject({
  claimId: ApprovedClaimId,
  sensitivities: z.array(ResponseClaimSensitivity).max(3).refine(unique),
});
export type ResponseClaimEligibility = z.infer<typeof ResponseClaimEligibility>;

export const ResponseViewPlanningInput = z
  .strictObject({
    clarificationPlan: ClarificationPlan,
    approvedClaims: z.array(ApprovedAnswerClaim).min(1).max(20),
    claimEligibility: z.array(ResponseClaimEligibility).min(1).max(20),
  })
  .superRefine((input, context) => {
    const claimIds = input.approvedClaims.map((claim) => claim.claimId);
    const eligibilityIds = input.claimEligibility.map((eligibility) => eligibility.claimId);
    if (!unique(claimIds)) {
      context.addIssue({
        code: 'custom',
        path: ['approvedClaims'],
        message: 'approved claim ids must be unique',
      });
    }
    if (!unique(eligibilityIds)) {
      context.addIssue({
        code: 'custom',
        path: ['claimEligibility'],
        message: 'claim eligibility ids must be unique',
      });
    }
    if (
      claimIds.length !== eligibilityIds.length ||
      claimIds.some((claimId, index) => eligibilityIds[index] !== claimId)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['claimEligibility'],
        message: 'claim eligibility must cover approved claims in deterministic claim order',
      });
    }
  });
export type ResponseViewPlanningInput = z.infer<typeof ResponseViewPlanningInput>;

export const ResponseContentCategory = z.enum([
  'conclusion',
  'mechanism-and-implication',
  'material-caveat',
  'practical-options',
]);
export type ResponseContentCategory = z.infer<typeof ResponseContentCategory>;

const ClarificationNoteMaterialCaveatId = z.enum([
  'clarification-note:birth-time-reliability-unavailable',
  'clarification-note:target-period-unavailable',
  'clarification-note:ruleset-variant-unavailable',
]);

const DegradationMaterialCaveatId = z.enum([
  'degradation:omit-time-sensitive-claims',
  'degradation:omit-timing-claims',
  'degradation:omit-ruleset-variant-sensitive-claims',
]);

const ClaimConstraintMaterialCaveatId = z
  .string()
  .regex(
    /^claim-constraint:approved-claim:fact-\d+:(?:caveat|warning):\d+$/,
    'claim constraint caveat ids must resolve to one approved claim constraint',
  );

export const MaterialCaveatId = z.union([
  ClarificationNoteMaterialCaveatId,
  DegradationMaterialCaveatId,
  ClaimConstraintMaterialCaveatId,
]);
export type MaterialCaveatId = z.infer<typeof MaterialCaveatId>;

const DEGRADATION_NOTE_PAIRS = [
  {
    note: 'clarification-note:birth-time-reliability-unavailable',
    degradation: 'degradation:omit-time-sensitive-claims',
  },
  {
    note: 'clarification-note:target-period-unavailable',
    degradation: 'degradation:omit-timing-claims',
  },
  {
    note: 'clarification-note:ruleset-variant-unavailable',
    degradation: 'degradation:omit-ruleset-variant-sensitive-claims',
  },
] as const;

function expectedContentCategories(
  requestedDepth: ResponseDepth,
  materialCaveatIds: readonly string[],
): ResponseContentCategory[] {
  return [
    'conclusion',
    'mechanism-and-implication',
    ...(materialCaveatIds.length === 0 ? [] : (['material-caveat'] as const)),
    ...(requestedDepth === 'brief' ? [] : (['practical-options'] as const)),
  ];
}

export const ResponseView = z
  .strictObject({
    contractVersion: z.literal(RESPONSE_VIEW_CONTRACT_VERSION),
    clarificationStatus: z.enum(['ready', 'degraded']),
    topic: InterpretationTopic,
    requestedDepth: ResponseDepth,
    system: ChartSystem,
    approvedClaimIds: z.array(ApprovedClaimId).min(1).max(20).refine(unique),
    materialCaveatIds: z.array(MaterialCaveatId).max(403).refine(unique),
    allowedContentCategories: z.array(ResponseContentCategory).min(2).max(4).refine(unique),
    auditAvailability: z.literal('explicit-request-only'),
    transient: z.literal(true),
    regenerable: z.literal(true),
  })
  .superRefine((view, context) => {
    const expectedCategories = expectedContentCategories(
      view.requestedDepth,
      view.materialCaveatIds,
    );
    if (
      expectedCategories.length !== view.allowedContentCategories.length ||
      expectedCategories.some(
        (category, index) => category !== view.allowedContentCategories[index],
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['allowedContentCategories'],
        message: 'content categories must follow the fixed depth and caveat policy',
      });
    }

    const approvedClaimIds = new Set(view.approvedClaimIds);
    for (const [index, caveatId] of view.materialCaveatIds.entries()) {
      if (caveatId.startsWith('claim-constraint:')) {
        const claimId = caveatId.split(':').slice(1, 3).join(':');
        if (!approvedClaimIds.has(claimId)) {
          context.addIssue({
            code: 'custom',
            path: ['materialCaveatIds', index],
            message: 'claim constraint caveats must resolve to an included approved claim',
          });
        }
      }
    }

    const hasClarificationCaveat = view.materialCaveatIds.some(
      (caveatId) =>
        caveatId.startsWith('clarification-note:') || caveatId.startsWith('degradation:'),
    );
    if (view.clarificationStatus === 'ready' && hasClarificationCaveat) {
      context.addIssue({
        code: 'custom',
        path: ['materialCaveatIds'],
        message: 'ready views cannot retain degradation material',
      });
    }
    if (view.clarificationStatus === 'degraded') {
      for (const pair of DEGRADATION_NOTE_PAIRS) {
        const hasNote = view.materialCaveatIds.includes(pair.note);
        const hasDegradation = view.materialCaveatIds.includes(pair.degradation);
        if (hasNote !== hasDegradation) {
          context.addIssue({
            code: 'custom',
            path: ['materialCaveatIds'],
            message: 'every degradation must retain its matching clarification note',
          });
        }
      }
      if (!hasClarificationCaveat) {
        context.addIssue({
          code: 'custom',
          path: ['materialCaveatIds'],
          message: 'degraded views require retained clarification material',
        });
      }
    }
  });
export type ResponseView = z.infer<typeof ResponseView>;
