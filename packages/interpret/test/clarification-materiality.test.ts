import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from '@loom/contracts';
import { describe, expect, it } from 'vitest';
import {
  ClarificationPlan,
  ClarificationPlanningInput,
  type ClarificationPlanningInput as ClarificationPlanningInputValue,
} from '../../contracts/src/clarification-plan.ts';
import { planClarificationMateriality } from '../src/clarification-materiality.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function input(
  overrides: Partial<ClarificationPlanningInputValue> = {},
): ClarificationPlanningInputValue {
  return ClarificationPlanningInput.parse({
    topic: 'career',
    requestedDepth: 'standard',
    systemScope: 'bazi',
    timeSensitiveClaims: false,
    birthTimeReliability: 'not-required',
    timingRequest: false,
    targetPeriod: 'not-required',
    rulesetVariantSensitiveClaims: false,
    rulesetVariant: 'not-required',
    ...overrides,
  });
}

describe('IQ-3B internal clarification materiality planner', () => {
  it('returns a ready, ordered, transient plan only when every material setting is explicit', () => {
    expect(planClarificationMateriality(input())).toEqual({
      contractVersion: 'clarification-plan/v1',
      status: 'ready',
      requiredQuestionIds: [],
      confirmedSettings: [
        { settingId: 'topic-intent', state: 'confirmed', valueId: 'topic:career' },
        { settingId: 'response-depth', state: 'confirmed', valueId: 'depth:standard' },
        { settingId: 'birth-time-reliability', state: 'not-required' },
        { settingId: 'target-period', state: 'not-required' },
        { settingId: 'ruleset-variant', state: 'not-required' },
        { settingId: 'system-scope', state: 'confirmed', valueId: 'system:bazi' },
      ],
      clarificationNoteCodes: [],
      degradationCodes: [],
      transient: true,
      regenerable: true,
    });
  });

  it('does not inherit a topic, depth, or system default when any of them is unconfirmed', () => {
    const plan = planClarificationMateriality(
      input({ topic: null, requestedDepth: null, systemScope: null }),
    );
    expect(plan.status).toBe('requires-clarification');
    expect(plan.requiredQuestionIds).toEqual(['topic-intent', 'response-depth', 'system-scope']);
    expect(plan.degradationCodes).toEqual([]);
  });

  it('orders all unresolved material settings by the closed registry', () => {
    const plan = planClarificationMateriality(
      input({
        topic: null,
        requestedDepth: null,
        systemScope: null,
        timeSensitiveClaims: true,
        birthTimeReliability: 'unresolved',
        timingRequest: true,
        targetPeriod: 'unresolved',
        rulesetVariantSensitiveClaims: true,
        rulesetVariant: 'unresolved',
      }),
    );
    expect(plan).toMatchObject({
      status: 'requires-clarification',
      requiredQuestionIds: [
        'topic-intent',
        'response-depth',
        'birth-time-reliability',
        'target-period',
        'ruleset-variant',
        'system-scope',
      ],
      degradationCodes: [],
    });
  });

  it('degrades only by omitting a time-sensitive claim class when time reliability is unavailable', () => {
    const plan = planClarificationMateriality(
      input({ timeSensitiveClaims: true, birthTimeReliability: 'unavailable' }),
    );
    expect(plan).toMatchObject({
      status: 'degraded',
      requiredQuestionIds: [],
      clarificationNoteCodes: ['birth-time-reliability-unavailable'],
      degradationCodes: ['omit-time-sensitive-claims'],
    });
    expect(plan.confirmedSettings).toContainEqual({
      settingId: 'birth-time-reliability',
      state: 'unavailable',
    });
  });

  it('degrades timing and variant-sensitive claim classes without fabricating the unavailable values', () => {
    const plan = planClarificationMateriality(
      input({
        timingRequest: true,
        targetPeriod: 'unavailable',
        rulesetVariantSensitiveClaims: true,
        rulesetVariant: 'unavailable',
      }),
    );
    expect(plan).toMatchObject({
      status: 'degraded',
      clarificationNoteCodes: ['target-period-unavailable', 'ruleset-variant-unavailable'],
      degradationCodes: ['omit-timing-claims', 'omit-ruleset-variant-sensitive-claims'],
    });
    expect(canonicalJson(plan)).not.toContain('valueId":"target');
    expect(canonicalJson(plan)).not.toContain('valueId":"ruleset');
  });

  it('does not issue a degraded delivery plan while another material setting remains unresolved', () => {
    const plan = planClarificationMateriality(
      input({
        timeSensitiveClaims: true,
        birthTimeReliability: 'unavailable',
        timingRequest: true,
        targetPeriod: 'unresolved',
      }),
    );
    expect(plan).toMatchObject({
      status: 'requires-clarification',
      requiredQuestionIds: ['target-period'],
      degradationCodes: [],
      clarificationNoteCodes: ['birth-time-reliability-unavailable'],
    });
  });

  it('rejects inconsistent conditional input and raw or extra fields before planning', () => {
    const base = {
      topic: 'career',
      requestedDepth: 'standard',
      systemScope: 'bazi',
      timeSensitiveClaims: false,
      birthTimeReliability: 'not-required',
      timingRequest: false,
      targetPeriod: 'not-required',
      rulesetVariantSensitiveClaims: false,
      rulesetVariant: 'not-required',
    };
    expect(
      ClarificationPlanningInput.safeParse({ ...base, timeSensitiveClaims: true }).success,
    ).toBe(false);
    expect(
      ClarificationPlanningInput.safeParse({ ...base, rawUserQuestion: 'private sentinel' })
        .success,
    ).toBe(false);
  });

  it('rejects a plan that tries to mark an unanswered material setting ready or degraded', () => {
    const readyWithQuestion = ClarificationPlan.safeParse({
      ...planClarificationMateriality(input()),
      requiredQuestionIds: ['system-scope'],
    });
    expect(readyWithQuestion.success).toBe(false);

    const degradedWithoutOmission = ClarificationPlan.safeParse({
      ...planClarificationMateriality(input()),
      status: 'degraded',
    });
    expect(degradedWithoutOmission.success).toBe(false);

    const incompleteReadyPlan = ClarificationPlan.safeParse({
      ...planClarificationMateriality(input()),
      confirmedSettings: [],
    });
    expect(incompleteReadyPlan.success).toBe(false);
  });

  it('is byte-identical for the same bounded planning input', () => {
    const bounded = input({ timeSensitiveClaims: true, birthTimeReliability: 'confirmed' });
    expect(canonicalJson(planClarificationMateriality(bounded))).toBe(
      canonicalJson(planClarificationMateriality(bounded)),
    );
  });

  it('keeps the planner internal, offline, and outside current runtime entry points', () => {
    const read = (relative: string): string => readFileSync(join(root, relative), 'utf8');
    const module = read('packages/interpret/src/clarification-materiality.ts');
    for (const forbidden of [
      'fetch(',
      'child_process',
      'openai',
      'rawUserQuestion:',
      'confidence:',
      'score:',
    ]) {
      expect(module, forbidden).not.toContain(forbidden);
    }
    for (const relative of [
      'packages/interpret/src/index.ts',
      'packages/orchestrator/src/interpret.ts',
      'packages/contracts/src/index.ts',
      'skills/xuan-ji-yu-heng/scripts/loom-chart.mjs',
      'package.json',
    ]) {
      expect(read(relative), relative).not.toContain('clarification-materiality');
    }
  });
});
