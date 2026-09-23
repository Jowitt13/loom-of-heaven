// Synthetic fixture - fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { AnswerRequest, canonicalJson, parseBirthInput } from '@loom/contracts';
import {
  buildAnswerPlan,
  careerOfficerEvidence,
  isTimeSensitiveFact,
  materialWarningCodes,
} from '@loom/interpret';
import { runAnswerPlan, runInterpret } from '@loom/orchestrator';

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
  // Deliberately partial: P4 answer-plan v2 must still calculate all four systems.
  settings: { systems: ['bazi'] },
});

describe('public result and answer plan', () => {
  it('forces all systems internally without changing the private calculate contract', () => {
    const { publicResult } = runAnswerPlan(syntheticInput, { now: FIXED, topic: 'career' });
    expect(publicResult.systems).toEqual([
      { system: 'western', status: 'computed' },
      { system: 'bazi', status: 'computed' },
      { system: 'ziwei', status: 'computed' },
      { system: 'vedic', status: 'computed' },
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

  it('keeps time-dependent limits explicit when birth time is unknown', { timeout: 30_000 }, () => {
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

  it('requires only warnings that qualify facts selected for the current topic', () => {
    const { publicResult } = runAnswerPlan(syntheticInput, { now: FIXED, topic: 'career' });
    const scoped = {
      ...publicResult,
      facts: [
        {
          ...publicResult.facts[0]!,
          topic: 'career' as const,
          caveat: undefined,
          evidence: [{ kind: 'bazi' as const, ref: 'bazi.test' }],
        },
      ],
      warnings: [
        {
          code: 'BAZI_GENDER_REQUIRED' as const,
          severity: 'warning' as const,
          system: 'bazi' as const,
          impact: '八字的周期结果受限。',
          nextStep: '补充所需信息后可重新计算。',
        },
        {
          code: 'HIGH_LATITUDE_HOUSE_RISK' as const,
          severity: 'warning' as const,
          system: 'western' as const,
          impact: '西方宫位可能不稳定。',
          nextStep: '需要时比较不同宫制。',
        },
      ],
    };
    const plan = buildAnswerPlan(scoped, { topic: 'career' });
    expect(plan.requiredWarningCodes).toEqual(['BAZI_GENDER_REQUIRED']);
    expect(plan.responseRequirements.contentOrder).not.toContain('disclaimer');
  });

  it('drops unrelated SOLAR_TIME_APPROXIMATE when selected facts are not time-sensitive', () => {
    const { publicResult } = runAnswerPlan(syntheticInput, { now: FIXED, topic: 'career' });
    const tenGodOnly = {
      ...publicResult,
      facts: publicResult.facts.filter((fact) =>
        fact.evidence.some((evidence) =>
          /^bazi\.pillars\.(year|month|day|hour)\.tenGod$/.test(evidence.ref),
        ),
      ),
    };
    expect(tenGodOnly.facts.length).toBeGreaterThan(0);
    for (const fact of tenGodOnly.facts) {
      expect(isTimeSensitiveFact(fact)).toBe(false);
    }
    const plan = buildAnswerPlan(tenGodOnly, { topic: 'career' });
    expect(plan.requiredWarningCodes).not.toContain('SOLAR_TIME_APPROXIMATE');
    expect(plan.requiredWarningCodes).not.toContain('TIME_ACCURACY_APPROXIMATE');
  });

  it('resolves career officer evidence to actual pillars and hour-pillar time sensitivity', () => {
    const hourOnly = careerOfficerEvidence([
      { pillar: 'year', tenGod: '正财' },
      { pillar: 'month', tenGod: '劫财' },
      { pillar: 'day', tenGod: null },
      { pillar: 'hour', tenGod: '七杀' },
    ]);
    expect(hourOnly).toEqual({ label: '七杀', refs: ['bazi.pillars.hour.tenGod'] });

    const nonHourOnly = careerOfficerEvidence([
      { pillar: 'year', tenGod: '七杀' },
      { pillar: 'month', tenGod: '正财' },
      { pillar: 'day', tenGod: null },
      { pillar: 'hour', tenGod: '偏财' },
    ]);
    expect(nonHourOnly).toEqual({ label: '七杀', refs: ['bazi.pillars.year.tenGod'] });

    const mixedSameLabel = careerOfficerEvidence([
      { pillar: 'year', tenGod: '七杀' },
      { pillar: 'month', tenGod: '正财' },
      { pillar: 'day', tenGod: null },
      { pillar: 'hour', tenGod: '七杀' },
    ]);
    expect(mixedSameLabel).toEqual({
      label: '七杀',
      refs: ['bazi.pillars.year.tenGod', 'bazi.pillars.hour.tenGod'],
    });

    const dualLabels = careerOfficerEvidence([
      { pillar: 'year', tenGod: '七杀' },
      { pillar: 'hour', tenGod: '正官' },
    ]);
    expect(dualLabels).toEqual({ label: null, refs: [] });

    const toFact = (refs: string[]) => ({
      id: 'fact-1' as const,
      topic: 'career' as const,
      claim: '命盘里有「七杀」这一传统十神',
      evidence: [
        ...refs.map((ref) => ({ kind: 'bazi' as const, ref })),
        { kind: 'bazi-rule' as const, ref: 'bazi-rule/ten-gods/xiang-yi' },
      ],
      caveat: '官杀仅示事业/责任倾向的结构，非职业预言。',
    });
    expect(isTimeSensitiveFact(toFact(hourOnly.refs))).toBe(true);
    expect(isTimeSensitiveFact(toFact(nonHourOnly.refs))).toBe(false);
    expect(isTimeSensitiveFact(toFact(mixedSameLabel.refs))).toBe(true);

    const approximateWarnings = [
      {
        code: 'TIME_ACCURACY_APPROXIMATE' as const,
        severity: 'info' as const,
        system: 'time' as const,
        impact: 'x',
        nextStep: 'y',
      },
      {
        code: 'SOLAR_TIME_APPROXIMATE' as const,
        severity: 'info' as const,
        system: 'time' as const,
        impact: 'x',
        nextStep: 'y',
      },
      {
        code: 'TIME_UNKNOWN' as const,
        severity: 'warning' as const,
        system: 'time' as const,
        impact: 'x',
        nextStep: 'y',
      },
      {
        code: 'NEAR_BOUNDARY' as const,
        severity: 'info' as const,
        system: 'time' as const,
        impact: 'x',
        nextStep: 'y',
      },
    ];
    const hourOnlyCodes = materialWarningCodes(approximateWarnings, [toFact(hourOnly.refs)]);
    expect(hourOnlyCodes).toContain('TIME_ACCURACY_APPROXIMATE');
    expect(hourOnlyCodes).toContain('SOLAR_TIME_APPROXIMATE');
    expect(hourOnlyCodes).toContain('TIME_UNKNOWN');
    expect(hourOnlyCodes).toContain('NEAR_BOUNDARY');

    const nonHourCodes = materialWarningCodes(approximateWarnings, [toFact(nonHourOnly.refs)]);
    expect(nonHourCodes).not.toContain('TIME_ACCURACY_APPROXIMATE');
    expect(nonHourCodes).not.toContain('SOLAR_TIME_APPROXIMATE');
    expect(nonHourCodes).toContain('TIME_UNKNOWN');
    expect(nonHourCodes).toContain('NEAR_BOUNDARY');

    const mixedCodes = materialWarningCodes(approximateWarnings, [toFact(mixedSameLabel.refs)]);
    expect(mixedCodes).toContain('TIME_ACCURACY_APPROXIMATE');
    expect(mixedCodes).toContain('SOLAR_TIME_APPROXIMATE');
  });

  it('keeps TIME_UNKNOWN and NEAR_BOUNDARY always material, and time warnings when facts are time-sensitive', () => {
    const timeFact = {
      id: 'fact-1',
      topic: 'career' as const,
      claim: '西方中天（MC）位于Capricorn',
      evidence: [{ kind: 'western' as const, ref: 'western.angles.mc.sign' }],
      caveat: '需确切出生时间方有宫位。',
    };
    const plainFact = {
      id: 'fact-2',
      topic: 'career' as const,
      claim: '命盘里有「七杀」这一传统十神',
      evidence: [
        { kind: 'bazi' as const, ref: 'bazi.pillars.year.tenGod' },
        { kind: 'bazi-rule' as const, ref: 'bazi-rule/ten-gods/xiang-yi' },
      ],
      caveat: '官杀仅示事业/责任倾向的结构，非职业预言。',
    };
    const alwaysWarnings = [
      {
        code: 'TIME_UNKNOWN' as const,
        severity: 'warning' as const,
        system: 'time' as const,
        impact: 'x',
        nextStep: 'y',
      },
      {
        code: 'NEAR_BOUNDARY' as const,
        severity: 'info' as const,
        system: 'time' as const,
        impact: 'x',
        nextStep: 'y',
      },
      {
        code: 'SOLAR_TIME_APPROXIMATE' as const,
        severity: 'info' as const,
        system: 'time' as const,
        impact: 'x',
        nextStep: 'y',
      },
    ];
    const plainOnly = buildAnswerPlan(
      {
        contractVersion: 'public-result/v2',
        engineVersion: '0.4.0',
        sourceSchemaVersion: '0.1.0',
        systems: [{ system: 'bazi', status: 'computed' }],
        inputReliability: { timeAccuracy: 'exact', birthTimeKnown: true },
        warnings: alwaysWarnings,
        facts: [plainFact],
        rulesets: [],
        disclaimers: [],
        followupOffers: [],
      },
      { topic: 'career' },
    );
    expect(plainOnly.requiredWarningCodes).toEqual(['TIME_UNKNOWN', 'NEAR_BOUNDARY']);
    const timeScoped = buildAnswerPlan(
      {
        contractVersion: 'public-result/v2',
        engineVersion: '0.4.0',
        sourceSchemaVersion: '0.1.0',
        systems: [{ system: 'western', status: 'computed' }],
        inputReliability: { timeAccuracy: 'exact', birthTimeKnown: true },
        warnings: alwaysWarnings,
        facts: [timeFact],
        rulesets: [],
        disclaimers: [],
        followupOffers: [],
      },
      { topic: 'career' },
    );
    expect(timeScoped.requiredWarningCodes).toContain('SOLAR_TIME_APPROXIMATE');
    expect(timeScoped.requiredWarningCodes).toContain('TIME_UNKNOWN');
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

  it('keeps pattern and industry out of the default career claim set (ADR 0021)', () => {
    const { answerPlan, publicResult } = runAnswerPlan(syntheticInput, {
      now: FIXED,
      topic: 'career',
    });
    const claims = answerPlan.selectedFacts.map((fact) => fact.claim).join('\n');
    for (const blocked of ['格局', '阳刃', '建禄', '喜用', '适合行业', '行业方向']) {
      expect(claims, blocked).not.toContain(blocked);
    }
    for (const fact of answerPlan.selectedFacts) {
      for (const evidence of fact.evidence) {
        expect(evidence.ref).not.toContain('bazi-rule/pattern');
        expect(evidence.ref).not.toContain('bazi-rule/industry');
        expect(evidence.ref).not.toContain('bazi-rule/useful-god');
      }
    }
    // The mixed claim is split: pattern may exist as a technical fact only.
    const patternFacts = publicResult.facts.filter((fact) =>
      fact.evidence.some((evidence) => evidence.ref === 'bazi-rule/pattern'),
    );
    for (const fact of patternFacts) {
      expect(fact.topic).not.toBe('career');
    }
    const industryFacts = publicResult.facts.filter((fact) =>
      fact.evidence.some((evidence) => evidence.ref === 'bazi-rule/industry/wu-xing'),
    );
    for (const fact of industryFacts) {
      expect(fact.topic).not.toBe('career');
    }
  });

  it('offers at most one ten-god cultural reference with its non-prophecy caveat', () => {
    const { answerPlan } = runAnswerPlan(syntheticInput, { now: FIXED, topic: 'career' });
    const tenGodFacts = answerPlan.selectedFacts.filter((fact) =>
      fact.evidence.some((evidence) =>
        /^bazi\.pillars\.(year|month|day|hour)\.tenGod$/.test(evidence.ref),
      ),
    );
    expect(tenGodFacts.length).toBeLessThanOrEqual(1);
    for (const fact of tenGodFacts) {
      expect(fact.claim).toMatch(/命盘里有「.+」这一传统十神/);
      expect(fact.claim).not.toMatch(/格/);
      expect(fact.caveat).toContain('非职业预言');
      // Short gloss only — never the full TEN_GOD_MEANINGS strings.
      expect(fact.reason ?? '').toContain('传统上常联到');
      expect(fact.reason ?? '').not.toContain('需制化为权');
      expect(fact.reason ?? '').not.toContain('女命之夫星');
      expect(fact.reason ?? '').not.toContain('妻星');
      expect(fact.reason ?? '').not.toContain('规范');
      // Gloss words stay inside the frozen TEN_GOD_MEANINGS vocabulary.
      expect(fact.reason ?? '').toMatch(/权威|压力|竞争|责任|自律|地位/);
      // The gloss is rule-backed, not only a provider-fact reason.
      expect(fact.evidence.some((evidence) => evidence.ref === 'bazi-rule/ten-gods/xiang-yi')).toBe(
        true,
      );
    }
  });

  it('omits the cultural reference when 正官 and 七杀 co-occur (no arbitrary winner)', async () => {
    const { selectCareerOfficerLabel } = await import('@loom/interpret');
    expect(selectCareerOfficerLabel(['七杀'])).toBe('七杀');
    expect(selectCareerOfficerLabel(['正官'])).toBe('正官');
    expect(selectCareerOfficerLabel(['七杀', '七杀'])).toBe('七杀');
    expect(selectCareerOfficerLabel(['正官', '七杀'])).toBeNull();
    expect(selectCareerOfficerLabel(['七杀', '正官', '正官'])).toBeNull();
    expect(selectCareerOfficerLabel([])).toBeNull();
    expect(selectCareerOfficerLabel(['正财'])).toBeNull();
  });
});
