// Synthetic fixture - fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { AnswerRequest, canonicalJson, parseBirthInput } from '@ming/contracts';
import { buildAnswerPlan } from '@ming/interpret';
import { runAnswerPlan, runInterpret } from '@ming/orchestrator';

const FIXED = Date.parse('2026-01-01T00:00:00Z');

const syntheticInput = parseBirthInput({
  calendar: 'gregorian',
  localDate: '1991-02-03',
  localTime: '04:05:06',
  timeAccuracy: 'exact',
  timezone: 'Pacific/Port_Moresby',
  location: {
    latitude: 12.345678,
    longitude: 98.765432,
    source: 'user',
    displayName: 'Synthetic answer-plan location sentinel',
  },
  ruleGender: 'female',
  // Deliberately partial: answer-plan must still calculate all three systems.
  settings: { systems: ['bazi'] },
});

describe('public result and answer plan', () => {
  it('forces all systems internally without changing the private calculate contract', () => {
    const { publicResult } = runAnswerPlan(syntheticInput, { now: FIXED, topic: 'career' });
    expect(publicResult.systems).toEqual([
      { system: 'western', status: 'computed' },
      { system: 'bazi', status: 'computed' },
      { system: 'ziwei', status: 'computed' },
    ]);
  });

  it('removes direct birth input, stable ids, raw warnings and raw evidence notes', () => {
    const output = runAnswerPlan(syntheticInput, { now: FIXED, topic: 'career' });
    const json = canonicalJson(output);
    for (const forbidden of [
      '1991-02-03',
      '04:05:06',
      'Pacific/Port_Moresby',
      '12.345678',
      '98.765432',
      'Synthetic answer-plan location sentinel',
      'requestId',
      'originalInput',
      'normalizedTime',
      'calculatedAt',
    ]) {
      expect(json).not.toContain(forbidden);
    }
    for (const fact of output.publicResult.facts) {
      for (const evidence of fact.evidence) expect(evidence).not.toHaveProperty('note');
    }
    for (const warning of output.publicResult.warnings) {
      expect(warning).not.toHaveProperty('message');
      expect(warning).not.toHaveProperty('detail');
    }
  });

  it('removes raw calendar-conversion warning details too', () => {
    const lunar = parseBirthInput({
      ...syntheticInput,
      calendar: 'lunar',
      localDate: '1991-01-02',
      lunarLeapMonth: false,
    });
    const output = runAnswerPlan(lunar, { now: FIXED, topic: 'general' });
    expect(canonicalJson(output)).not.toContain('1991-01-02');
    expect(output.publicResult.warnings.some((warning) => warning.code === 'LUNAR_CONVERTED')).toBe(
      true,
    );
  });

  it('selects only the requested topic facts and makes every usable fact citable', () => {
    const { publicResult, answerPlan } = runAnswerPlan(syntheticInput, {
      now: FIXED,
      topic: 'career',
      lens: 'advice',
    });
    expect(answerPlan.request).toEqual({ topic: 'career', lens: 'advice' });
    expect(answerPlan.selectedFacts.length).toBeGreaterThan(0);
    expect(answerPlan.selectedFacts.every((fact) => fact.topic === 'career')).toBe(true);
    expect(answerPlan.allowedFactIds).toEqual(answerPlan.selectedFacts.map((fact) => fact.id));
    expect(publicResult.facts.map((fact) => fact.id)).toEqual(answerPlan.allowedFactIds);
    expect(answerPlan.responseRequirements.citeSelectedFactIds).toEqual(answerPlan.allowedFactIds);
    expect(answerPlan.responseRequirements.onlyUseSelectedFacts).toBe(true);
    expect(answerPlan.guardrails).toContain('no-investment-advice');
    expect(answerPlan.guardrails).toContain('no-medical-advice');
  });

  it('is deterministic with a fixed clock and does not fabricate a topic with no evidence', () => {
    const first = runAnswerPlan(syntheticInput, { now: FIXED, topic: 'career' });
    const second = runAnswerPlan(syntheticInput, { now: FIXED, topic: 'career' });
    expect(canonicalJson(first)).toBe(canonicalJson(second));

    const noFacts = {
      ...first.publicResult,
      facts: [],
    };
    const plan = buildAnswerPlan(noFacts, { topic: 'career' });
    expect(plan.answerability).toBe('not-supported');
    expect(plan.noEvidenceReason).toBe('NO_TOPIC_FACTS');
    expect(() =>
      buildAnswerPlan(noFacts, {
        topic: 'career',
        questionText: 'This must never enter the engine.',
      } as never),
    ).toThrow();
  });

  it('keeps time-dependent limits explicit when birth time is unknown', () => {
    const unknownTime = parseBirthInput({
      ...syntheticInput,
      localTime: undefined,
      timeAccuracy: 'unknown',
    });
    const { publicResult, answerPlan } = runAnswerPlan(unknownTime, {
      now: FIXED,
      topic: 'career',
    });
    expect(publicResult.inputReliability.birthTimeKnown).toBe(false);
    expect(answerPlan.requiredWarningCodes).toContain('TIME_UNKNOWN');
    expect(answerPlan.answerability).toBe('limited');
  });

  it('marks approximate and boundary-sensitive input as limited even for info warnings', () => {
    const approximateTime = parseBirthInput({
      ...syntheticInput,
      timeAccuracy: 'approximate',
    });
    const { answerPlan } = runAnswerPlan(approximateTime, {
      now: FIXED,
      topic: 'career',
    });
    expect(answerPlan.requiredWarningCodes).toContain('TIME_ACCURACY_APPROXIMATE');
    expect(answerPlan.answerability).toBe('limited');
  });

  it('uses fixed public warning copy and removes exact dynamic target dates', () => {
    const output = runAnswerPlan(syntheticInput, {
      now: FIXED,
      topic: 'general',
      at: { solarDate: '2026-05-20', timeIndex: 7 },
    });
    const json = canonicalJson(output);
    expect(json).not.toContain('2026-05-20');
    for (const warning of output.publicResult.warnings) {
      expect(warning.impact.length).toBeGreaterThan(0);
      expect(warning.nextStep.length).toBeGreaterThan(0);
      expect(warning).not.toHaveProperty('message');
      expect(warning).not.toHaveProperty('detail');
    }
  });

  it('keeps the existing interpret result shape while including dynamic-chart warnings once', () => {
    const { warnings } = runInterpret(syntheticInput, {
      now: FIXED,
      at: { solarDate: '2026-05-20', timeIndex: 7 },
    });
    const keys = warnings.map(
      (warning) => `${warning.code}:${warning.severity}:${warning.system}:${warning.message}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('rejects free-form question text at the public contract boundary', () => {
    expect(
      AnswerRequest.safeParse({
        topic: 'career',
        lens: 'overview',
        questionText: 'This must never enter the engine.',
      }).success,
    ).toBe(false);
    expect(() => runAnswerPlan(syntheticInput, {} as never)).toThrow();
  });
});
