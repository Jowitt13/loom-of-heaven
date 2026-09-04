import {
  CLARIFICATION_PLAN_CONTRACT_VERSION,
  ClarificationPlan,
  ClarificationPlanningInput,
  type ClarificationNoteCode,
  type ClarificationPlan as ClarificationPlanValue,
  type ClarificationQuestionId,
  type ClarificationValueId,
  ConfirmedClarificationSetting,
  type ConfirmedClarificationSetting as ConfirmedClarificationSettingValue,
  type ConfirmationState,
  type DegradationCode,
} from '../../contracts/src/clarification-plan.ts';

const QUESTION_ORDER = [
  'topic-intent',
  'response-depth',
  'birth-time-reliability',
  'target-period',
  'ruleset-variant',
  'system-scope',
] as const satisfies readonly ClarificationQuestionId[];

function setting(
  settingId: ClarificationQuestionId,
  state: ConfirmationState,
  valueId?: ClarificationValueId,
): ConfirmedClarificationSettingValue {
  return ConfirmedClarificationSetting.parse({
    settingId,
    state,
    ...(valueId === undefined ? {} : { valueId }),
  });
}

/**
 * Produces a closed, transient plan. It never promotes the existing answer
 * plan's lens default into a confirmation and never accepts a free-form value.
 */
export function planClarificationMateriality(rawInput: unknown): ClarificationPlanValue {
  const input = ClarificationPlanningInput.parse(rawInput);
  const unresolved = new Set<ClarificationQuestionId>();
  const confirmedSettings: ConfirmedClarificationSettingValue[] = [];
  const clarificationNoteCodes: ClarificationNoteCode[] = [];
  const degradationCodes: DegradationCode[] = [];

  if (input.topic === null) unresolved.add('topic-intent');
  else confirmedSettings.push(setting('topic-intent', 'confirmed', `topic:${input.topic}`));

  if (input.requestedDepth === null) unresolved.add('response-depth');
  else
    confirmedSettings.push(setting('response-depth', 'confirmed', `depth:${input.requestedDepth}`));

  if (input.timeSensitiveClaims) {
    switch (input.birthTimeReliability) {
      case 'confirmed':
        confirmedSettings.push(
          setting('birth-time-reliability', 'confirmed', 'birth-time-reliability:confirmed'),
        );
        break;
      case 'unavailable':
        confirmedSettings.push(setting('birth-time-reliability', 'unavailable'));
        clarificationNoteCodes.push('birth-time-reliability-unavailable');
        degradationCodes.push('omit-time-sensitive-claims');
        break;
      case 'unresolved':
        unresolved.add('birth-time-reliability');
        break;
    }
  } else {
    confirmedSettings.push(setting('birth-time-reliability', 'not-required'));
  }

  if (input.timingRequest) {
    switch (input.targetPeriod) {
      case 'confirmed':
        confirmedSettings.push(setting('target-period', 'confirmed', 'target-period:confirmed'));
        break;
      case 'unavailable':
        confirmedSettings.push(setting('target-period', 'unavailable'));
        clarificationNoteCodes.push('target-period-unavailable');
        degradationCodes.push('omit-timing-claims');
        break;
      case 'unresolved':
        unresolved.add('target-period');
        break;
    }
  } else {
    confirmedSettings.push(setting('target-period', 'not-required'));
  }

  if (input.rulesetVariantSensitiveClaims) {
    switch (input.rulesetVariant) {
      case 'confirmed':
        confirmedSettings.push(
          setting('ruleset-variant', 'confirmed', 'ruleset-variant:confirmed'),
        );
        break;
      case 'unavailable':
        confirmedSettings.push(setting('ruleset-variant', 'unavailable'));
        clarificationNoteCodes.push('ruleset-variant-unavailable');
        degradationCodes.push('omit-ruleset-variant-sensitive-claims');
        break;
      case 'unresolved':
        unresolved.add('ruleset-variant');
        break;
    }
  } else {
    confirmedSettings.push(setting('ruleset-variant', 'not-required'));
  }

  if (input.systemScope === null) unresolved.add('system-scope');
  else confirmedSettings.push(setting('system-scope', 'confirmed', `system:${input.systemScope}`));

  const requiredQuestionIds = QUESTION_ORDER.filter((questionId) => unresolved.has(questionId));
  const hasUnresolvedMateriality = requiredQuestionIds.length > 0;
  return ClarificationPlan.parse({
    contractVersion: CLARIFICATION_PLAN_CONTRACT_VERSION,
    status: hasUnresolvedMateriality
      ? 'requires-clarification'
      : degradationCodes.length > 0
        ? 'degraded'
        : 'ready',
    requiredQuestionIds,
    confirmedSettings,
    clarificationNoteCodes,
    degradationCodes: hasUnresolvedMateriality ? [] : degradationCodes,
    transient: true,
    regenerable: true,
  });
}
