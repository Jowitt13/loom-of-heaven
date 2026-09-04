import { z } from 'zod';
import { ChartSystem } from './birth-input.ts';
import { InterpretationTopic } from './interpretation.ts';

/**
 * Internal-only IQ-3 contracts. This file is deliberately excluded from the
 * package's public index until a separately admitted integration slice exists.
 */
export const CLARIFICATION_PLAN_CONTRACT_VERSION = 'clarification-plan/v1';

export const ClarificationQuestionId = z.enum([
  'topic-intent',
  'response-depth',
  'birth-time-reliability',
  'target-period',
  'ruleset-variant',
  'system-scope',
]);
export type ClarificationQuestionId = z.infer<typeof ClarificationQuestionId>;

export const ClarificationStatus = z.enum(['ready', 'requires-clarification', 'degraded']);
export type ClarificationStatus = z.infer<typeof ClarificationStatus>;

export const ConfirmationState = z.enum(['confirmed', 'unavailable', 'not-required']);
export type ConfirmationState = z.infer<typeof ConfirmationState>;

export const ResponseDepth = z.enum(['brief', 'standard', 'detailed']);
export type ResponseDepth = z.infer<typeof ResponseDepth>;

const ConditionalResolution = z.enum(['not-required', 'confirmed', 'unavailable', 'unresolved']);

/**
 * Input states are explicit rather than defaulted. `unresolved` may only
 * appear when the matching claim class is material to this bounded request.
 */
export const ClarificationPlanningInput = z
  .strictObject({
    topic: InterpretationTopic.nullable(),
    requestedDepth: ResponseDepth.nullable(),
    systemScope: ChartSystem.nullable(),
    timeSensitiveClaims: z.boolean(),
    birthTimeReliability: ConditionalResolution,
    timingRequest: z.boolean(),
    targetPeriod: ConditionalResolution,
    rulesetVariantSensitiveClaims: z.boolean(),
    rulesetVariant: ConditionalResolution,
  })
  .superRefine((input, context) => {
    const conditionalSettings = [
      {
        required: input.timeSensitiveClaims,
        value: input.birthTimeReliability,
        path: ['birthTimeReliability'],
      },
      {
        required: input.timingRequest,
        value: input.targetPeriod,
        path: ['targetPeriod'],
      },
      {
        required: input.rulesetVariantSensitiveClaims,
        value: input.rulesetVariant,
        path: ['rulesetVariant'],
      },
    ] as const;

    for (const setting of conditionalSettings) {
      const invalid = setting.required
        ? setting.value === 'not-required'
        : setting.value !== 'not-required';
      if (invalid) {
        context.addIssue({
          code: 'custom',
          path: [...setting.path],
          message: 'conditional setting must be explicit exactly when its claim class is material',
        });
      }
    }
  });
export type ClarificationPlanningInput = z.infer<typeof ClarificationPlanningInput>;

export const ClarificationValueId = z.enum([
  'topic:character',
  'topic:career',
  'topic:wealth',
  'topic:marriage',
  'topic:studies',
  'topic:health',
  'topic:general',
  'depth:brief',
  'depth:standard',
  'depth:detailed',
  'system:western',
  'system:bazi',
  'system:ziwei',
  'system:vedic',
  'birth-time-reliability:confirmed',
  'target-period:confirmed',
  'ruleset-variant:confirmed',
]);
export type ClarificationValueId = z.infer<typeof ClarificationValueId>;

export const ClarificationNoteCode = z.enum([
  'birth-time-reliability-unavailable',
  'target-period-unavailable',
  'ruleset-variant-unavailable',
]);
export type ClarificationNoteCode = z.infer<typeof ClarificationNoteCode>;

export const DegradationCode = z.enum([
  'omit-time-sensitive-claims',
  'omit-timing-claims',
  'omit-ruleset-variant-sensitive-claims',
]);
export type DegradationCode = z.infer<typeof DegradationCode>;

export const ConfirmedClarificationSetting = z
  .strictObject({
    settingId: ClarificationQuestionId,
    state: ConfirmationState,
    valueId: ClarificationValueId.optional(),
  })
  .superRefine((setting, context) => {
    if (setting.state === 'confirmed' && setting.valueId === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['valueId'],
        message: 'confirmed settings require a bounded value id',
      });
    }
    if (setting.state !== 'confirmed' && setting.valueId !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['valueId'],
        message: 'only confirmed settings may retain a value id',
      });
    }
  });
export type ConfirmedClarificationSetting = z.infer<typeof ConfirmedClarificationSetting>;

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

const QUESTION_ORDER = [
  'topic-intent',
  'response-depth',
  'birth-time-reliability',
  'target-period',
  'ruleset-variant',
  'system-scope',
] as const satisfies readonly ClarificationQuestionId[];

const UNAVAILABLE_REQUIREMENTS: Readonly<
  Partial<
    Record<
      ClarificationQuestionId,
      { noteCode: ClarificationNoteCode; degradationCode: DegradationCode }
    >
  >
> = {
  'birth-time-reliability': {
    noteCode: 'birth-time-reliability-unavailable',
    degradationCode: 'omit-time-sensitive-claims',
  },
  'target-period': {
    noteCode: 'target-period-unavailable',
    degradationCode: 'omit-timing-claims',
  },
  'ruleset-variant': {
    noteCode: 'ruleset-variant-unavailable',
    degradationCode: 'omit-ruleset-variant-sensitive-claims',
  },
};

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export const ClarificationPlan = z
  .strictObject({
    contractVersion: z.literal(CLARIFICATION_PLAN_CONTRACT_VERSION),
    status: ClarificationStatus,
    requiredQuestionIds: z.array(ClarificationQuestionId).max(6).refine(unique),
    confirmedSettings: z.array(ConfirmedClarificationSetting).max(6),
    clarificationNoteCodes: z.array(ClarificationNoteCode).max(3).refine(unique),
    degradationCodes: z.array(DegradationCode).max(3).refine(unique),
    transient: z.literal(true),
    regenerable: z.literal(true),
  })
  .superRefine((plan, context) => {
    const settingIds = plan.confirmedSettings.map((setting) => setting.settingId);
    if (!unique(settingIds)) {
      context.addIssue({
        code: 'custom',
        path: ['confirmedSettings'],
        message: 'setting ids must be unique',
      });
    }
    const unresolvedSet = new Set(plan.requiredQuestionIds);
    const expectedSettingOrder = QUESTION_ORDER.filter(
      (questionId) => !unresolvedSet.has(questionId),
    );
    const coveredSettingIds = new Set([...settingIds, ...plan.requiredQuestionIds]);
    if (
      coveredSettingIds.size !== QUESTION_ORDER.length ||
      QUESTION_ORDER.some((questionId) => !coveredSettingIds.has(questionId))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['confirmedSettings'],
        message: 'every material setting must be explicitly resolved or require clarification',
      });
    }
    if (
      !sameStrings(
        plan.requiredQuestionIds,
        QUESTION_ORDER.filter((id) => unresolvedSet.has(id)),
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['requiredQuestionIds'],
        message: 'required questions must use the fixed materiality order',
      });
    }
    if (!sameStrings(settingIds, expectedSettingOrder)) {
      context.addIssue({
        code: 'custom',
        path: ['confirmedSettings'],
        message: 'resolved settings must use the fixed materiality order',
      });
    }
    for (const resolvedSetting of plan.confirmedSettings) {
      const unavailableRequirement = UNAVAILABLE_REQUIREMENTS[resolvedSetting.settingId];
      if (resolvedSetting.state === 'unavailable' && unavailableRequirement === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['confirmedSettings'],
          message: 'only conditional material settings may be unavailable',
        });
      }
      if (resolvedSetting.state === 'not-required' && unavailableRequirement === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['confirmedSettings'],
          message: 'topic, depth, and system scope must be confirmed before delivery',
        });
      }
      if (
        resolvedSetting.state === 'confirmed' &&
        !resolvedSetting.valueId?.startsWith(
          resolvedSetting.settingId === 'topic-intent'
            ? 'topic:'
            : resolvedSetting.settingId === 'response-depth'
              ? 'depth:'
              : resolvedSetting.settingId === 'system-scope'
                ? 'system:'
                : `${resolvedSetting.settingId}:`,
        )
      ) {
        context.addIssue({
          code: 'custom',
          path: ['confirmedSettings'],
          message: 'confirmed value id must belong to its resolved setting',
        });
      }
    }
    if (plan.status === 'requires-clarification') {
      if (plan.requiredQuestionIds.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['requiredQuestionIds'],
          message: 'clarification requires at least one question',
        });
      }
      if (plan.degradationCodes.length > 0) {
        context.addIssue({
          code: 'custom',
          path: ['degradationCodes'],
          message: 'a plan with unanswered material settings cannot deliver a degradation',
        });
      }
    } else if (plan.requiredQuestionIds.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['requiredQuestionIds'],
        message: 'ready or degraded plans cannot retain unanswered material settings',
      });
    }
    if (plan.status === 'ready' && plan.degradationCodes.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['degradationCodes'],
        message: 'ready plans cannot omit a material claim class',
      });
    }
    if (plan.status === 'degraded' && plan.degradationCodes.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['degradationCodes'],
        message: 'degraded plans require an explicit omitted claim class',
      });
    }
    if (plan.status !== 'requires-clarification') {
      const unavailableRequirements = plan.confirmedSettings
        .filter((setting) => setting.state === 'unavailable')
        .flatMap((setting) => {
          const requirement = UNAVAILABLE_REQUIREMENTS[setting.settingId];
          return requirement === undefined ? [] : [requirement];
        });
      if (
        !sameStrings(
          plan.clarificationNoteCodes,
          unavailableRequirements.map((requirement) => requirement.noteCode),
        ) ||
        !sameStrings(
          plan.degradationCodes,
          unavailableRequirements.map((requirement) => requirement.degradationCode),
        )
      ) {
        context.addIssue({
          code: 'custom',
          path: ['degradationCodes'],
          message: 'each unavailable setting must retain its matching note and omitted claim class',
        });
      }
    }
  });
export type ClarificationPlan = z.infer<typeof ClarificationPlan>;
