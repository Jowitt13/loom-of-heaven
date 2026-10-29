// Synthetic fixture - fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { canonicalJson, parseBirthInput } from '@loom/contracts';
import type { BirthInputRaw, InterpretationFacts } from '@loom/contracts';
import { runAnswerPlan, runInterpret } from '@loom/orchestrator';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const AT_2036 = { solarDate: '2036-05-20', timeIndex: 7 };

const base: BirthInputRaw = {
  calendar: 'gregorian',
  localDate: '1990-03-10',
  localTime: '08:15:00',
  timeAccuracy: 'exact',
  timezone: 'Asia/Shanghai',
  location: {
    latitude: 30.5,
    longitude: 114.3,
    source: 'user',
    displayName: 'Synthetic target-year location',
  },
  ruleGender: 'male',
  settings: { systems: ['bazi', 'ziwei'] },
};

function input(overrides: Partial<BirthInputRaw> = {}) {
  return parseBirthInput({ ...base, ...overrides });
}

/** Years actually used by per-year facts (annual 流年 claims start with `YYYY(`). */
function annualYears(interp: InterpretationFacts): string[] {
  return interp.facts
    .map((f) => /^(\d{4})\(/.exec(f.claim)?.[1])
    .filter((year): year is string => year !== undefined);
}

function claims(interp: InterpretationFacts): string {
  return interp.facts.map((f) => f.claim).join('\n');
}

describe('requested target year survives an unavailable Zi Wei horoscope', () => {
  it('uses at=2036 in annual and marriage-timing facts when the chart is complete', () => {
    const { interpretation, warnings } = runInterpret(input(), { now: NOW, at: AT_2036 });
    const years = annualYears(interpretation);
    expect(years[0]).toBe('2036');
    expect(years).not.toContain('2026');
    expect(claims(interpretation)).toContain('2036起十二年');
    expect(claims(interpretation)).toContain('当前流年（2036-05-20）');
    expect(warnings.map((w) => w.code)).not.toContain('ZIWEI_INPUT_REQUIRED');
  });

  it('keeps at=2036 when the birth time is unknown and Zi Wei is unavailable', () => {
    const { interpretation, warnings } = runInterpret(
      input({ localTime: undefined, timeAccuracy: 'unknown' }),
      { now: NOW, at: AT_2036 },
    );
    expect(warnings.map((w) => w.code)).toContain('ZIWEI_INPUT_REQUIRED');
    const years = annualYears(interpretation);
    expect(years[0]).toBe('2036');
    expect(years).not.toContain('2026');
    expect(claims(interpretation)).not.toContain('当前流年（');
  });

  it('keeps at=2036 when ruleGender is missing and Zi Wei is unavailable', () => {
    const { interpretation, warnings } = runInterpret(input({ ruleGender: undefined }), {
      now: NOW,
      at: AT_2036,
    });
    expect(warnings.map((w) => w.code)).toContain('ZIWEI_INPUT_REQUIRED');
    const years = annualYears(interpretation);
    expect(years[0]).toBe('2036');
    expect(years).not.toContain('2026');
    expect(claims(interpretation)).not.toContain('当前流年（');
  });

  it('keeps the injected now year when at is omitted', () => {
    const { interpretation } = runInterpret(input(), { now: NOW });
    const years = annualYears(interpretation);
    expect(years[0]).toBe('2026');
    expect(claims(interpretation)).toContain('2026起十二年');
    expect(claims(interpretation)).not.toContain('2036起十二年');
  });

  it('is deterministic for the same input, now and at', () => {
    const unknownTime = input({ localTime: undefined, timeAccuracy: 'unknown' });
    const first = runInterpret(unknownTime, { now: NOW, at: AT_2036 });
    const second = runInterpret(unknownTime, { now: NOW, at: AT_2036 });
    expect(canonicalJson(first.interpretation)).toBe(canonicalJson(second.interpretation));
    expect(canonicalJson(first.warnings)).toBe(canonicalJson(second.warnings));
  });

  it('keeps technical at=2036 without admitting its withheld timeline to answer-plan', () => {
    const { publicResult, answerPlan } = runAnswerPlan(
      input({ localTime: undefined, timeAccuracy: 'unknown' }),
      { now: NOW, at: AT_2036, topic: 'general' },
    );
    const years = publicResult.facts
      .map((f) => /^(\d{4})\(/.exec(f.claim)?.[1])
      .filter((year): year is string => year !== undefined);
    expect(years).toEqual([]);
    // Missing gender also makes Zi Wei unavailable, without relying on any
    // unknown-time placeholder fact remaining narratable.
    const technical = runInterpret(input({ ruleGender: undefined }), {
      now: NOW,
      at: AT_2036,
    }).interpretation;
    expect(annualYears(technical)[0]).toBe('2036');
    expect(annualYears(technical)).not.toContain('2026');
    expect(publicResult.systems.find((s) => s.system === 'ziwei')?.status).toBe('unavailable');
    expect(publicResult.warnings.map((w) => w.code)).toContain('ZIWEI_INPUT_REQUIRED');
    expect(answerPlan.requiredWarningCodes).toContain('TIME_UNKNOWN');
  });
});
