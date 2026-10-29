// Synthetic fixtures only. Solar-term minutes come from the Hong Kong Observatory
// 2024 table in HKT (UTC+8), minute precision:
// https://www.hko.gov.hk/tc/gts/astronomy/data/files/24SolarTerms_2024.xml
// 立春 2024-02-04 16:27, 驚蟄 2024-03-05 10:23.
import { describe, expect, it } from 'vitest';
import { canonicalJson, parseBirthInput } from '@loom/contracts';
import type { BaziChartResult, BirthInputRaw } from '@loom/contracts';
import { calculate, runAnswerPlan, runInterpret } from '../src/index.ts';

const NOW = Date.parse('2026-01-01T00:00:00Z');

const SHANGHAI = {
  latitude: 31.23,
  longitude: 121.47,
  source: 'user' as const,
  displayName: 'Synthetic Shanghai location',
};
const NEW_YORK = {
  latitude: 40.71,
  longitude: -74.01,
  source: 'user' as const,
  displayName: 'Synthetic New York location',
};

const base: BirthInputRaw = {
  calendar: 'gregorian',
  localDate: '2024-02-04',
  localTime: '17:00:00',
  timeAccuracy: 'exact',
  timezone: 'Asia/Shanghai',
  location: SHANGHAI,
  ruleGender: 'male',
  settings: { systems: ['bazi'] },
};

function chart(overrides: Partial<BirthInputRaw> = {}) {
  return calculate(parseBirthInput({ ...base, ...overrides }), { now: NOW });
}

function bazi(overrides: Partial<BirthInputRaw> = {}): BaziChartResult {
  const result = chart(overrides).bazi;
  if (!result) throw new Error('expected bazi result');
  return result;
}

function pillars(b: BaziChartResult): string[] {
  return [b.pillars.year, b.pillars.month, b.pillars.day, b.pillars.hour].map((p) =>
    p ? `${p.stem}${p.branch}` : '-',
  );
}

const yearMonth = (b: BaziChartResult) => pillars(b).slice(0, 2);

describe('BaZi instant vs local rule clock', () => {
  it('shares year/month for one instant in Shanghai and New York, keeping local day/hour', () => {
    const sh = chart({});
    const ny = chart({ localTime: '04:00:00', timezone: 'America/New_York', location: NEW_YORK });
    expect(sh.normalizedTime.utcInstant).toBe('2024-02-04T09:00:00Z');
    expect(ny.normalizedTime.utcInstant).toBe(sh.normalizedTime.utcInstant);
    expect(yearMonth(sh.bazi!)).toEqual(['甲辰', '丙寅']);
    expect(yearMonth(ny.bazi!)).toEqual(['甲辰', '丙寅']);
    // The day/hour pillars still follow each location's own civil clock.
    expect(pillars(sh.bazi!)[2]).toBe('戊戌');
    expect(pillars(ny.bazi!)[2]).toBe('戊戌');
    expect(pillars(sh.bazi!)[3]).toBe('辛酉');
    expect(pillars(ny.bazi!)[3]).toBe('甲寅');
  });

  it('switches year/month at 立春 (HKO 2024-02-04 16:27 HKT) in both directions', () => {
    const before = bazi({ localTime: '16:00:00' });
    const after = bazi({ localTime: '17:00:00' });
    expect(yearMonth(before)).toEqual(['癸卯', '乙丑']);
    expect(yearMonth(after)).toEqual(['甲辰', '丙寅']);
    // Male: yin year runs backward, yang year runs forward.
    expect(before.luckCycle!.forward).toBe(false);
    expect(after.luckCycle!.forward).toBe(true);
  });

  it('switches month at an ordinary 節, 驚蟄 (HKO 2024-03-05 10:23 HKT)', () => {
    const before = bazi({ localDate: '2024-03-05', localTime: '10:00:00' });
    const after = bazi({ localDate: '2024-03-05', localTime: '11:00:00' });
    expect(yearMonth(before)).toEqual(['甲辰', '丙寅']);
    expect(yearMonth(after)).toEqual(['甲辰', '丁卯']);
  });

  it('keeps one instant identical across the date line while local day/hour differ', () => {
    const kiriBundle = chart({
      localDate: '2024-03-10',
      localTime: '02:00:00',
      timezone: 'Pacific/Kiritimati',
      location: { latitude: 1.87, longitude: -157.4, source: 'user', displayName: 'Synthetic +14' },
    });
    const pagoBundle = chart({
      localDate: '2024-03-09',
      localTime: '01:00:00',
      timezone: 'Pacific/Pago_Pago',
      location: {
        latitude: -14.28,
        longitude: -170.7,
        source: 'user',
        displayName: 'Synthetic -11',
      },
    });
    expect(kiriBundle.normalizedTime.utcInstant).toBe('2024-03-09T12:00:00Z');
    expect(pagoBundle.normalizedTime.utcInstant).toBe(kiriBundle.normalizedTime.utcInstant);
    expect(kiriBundle.normalizedTime.localCivil.startsWith('2024-03-10')).toBe(true);
    expect(pagoBundle.normalizedTime.localCivil.startsWith('2024-03-09')).toBe(true);
    const kiritimati = kiriBundle.bazi!;
    const pago = pagoBundle.bazi!;
    expect(yearMonth(kiritimati)).toEqual(['甲辰', '丁卯']);
    expect(yearMonth(pago)).toEqual(['甲辰', '丁卯']);
    expect(pillars(kiritimati)[2]).toBe('癸酉');
    expect(pillars(pago)[2]).toBe('壬申');
    expect(pillars(kiritimati)[3]).not.toBe(pillars(pago)[3]);
    // 起运 uses the same instant frame, so direction and interval agree.
    expect(kiritimati.luckCycle!.forward).toBe(pago.luckCycle!.forward);
    expect(kiritimati.luckCycle!.startAfter).toEqual(pago.luckCycle!.startAfter);
    expect(kiritimati.luckCycle!.startSolarDate).toBe(pago.luckCycle!.startSolarDate);
  });

  it('keeps civil/mean/apparent as the day/hour clock without moving year/month', () => {
    const urumqi = {
      latitude: 43.83,
      longitude: 87.62,
      source: 'user' as const,
      displayName: 'Synthetic Urumqi location',
    };
    const run = (solarTimeMode: 'civil' | 'mean' | 'apparent') =>
      bazi({
        location: urumqi,
        settings: { systems: ['bazi'], bazi: { solarTimeMode } },
      });
    const civil = run('civil');
    const mean = run('mean');
    const apparent = run('apparent');
    for (const b of [civil, mean, apparent]) expect(yearMonth(b)).toEqual(['甲辰', '丙寅']);
    expect(civil.solarTimeApplied).toBe('civil');
    expect(mean.solarTimeApplied).toBe('mean');
    expect(apparent.solarTimeApplied).toBe('apparent');
    expect(pillars(civil)[3]).toBe('辛酉');
    // Urumqi is ~2h west of the UTC+8 meridian, so both solar modes move the hour.
    expect(pillars(mean)[3]).toBe('己未');
    expect(pillars(apparent)[3]).toBe('己未');
    expect(pillars(mean)[2]).toBe(pillars(civil)[2]);
  });

  it('handles a DST offset and the late-zi day boundary on the local clock', () => {
    const dstBundle = chart({
      localDate: '2024-03-10',
      localTime: '03:30:00',
      timezone: 'America/New_York',
      location: NEW_YORK,
    });
    expect(dstBundle.normalizedTime.localCivil).toContain('-04:00');
    const dst = dstBundle.bazi!;
    expect(dst.solarTimeApplied).toBe('civil');
    expect(pillars(dst)).toEqual(['甲辰', '丁卯', '癸酉', '甲寅']);

    const lateZiBundle = chart({
      localDate: '2024-03-09',
      localTime: '23:30:00',
      timezone: 'America/New_York',
      location: NEW_YORK,
    });
    const nextNoon = bazi({
      localDate: '2024-03-10',
      localTime: '12:00:00',
      timezone: 'America/New_York',
      location: NEW_YORK,
    });
    expect(lateZiBundle.normalizedTime.localCivil).toContain('-05:00');
    expect(pillars(lateZiBundle.bazi!)[2]).toBe(pillars(nextNoon)[2]);
    expect(pillars(lateZiBundle.bazi!)[3]).toBe('壬子');
  });

  it('keeps the unknown-time anchor and omits hour/luck cycle', () => {
    const unknown = bazi({ localTime: undefined, timeAccuracy: 'unknown' });
    expect(unknown.pillars.hour).toBeNull();
    expect(unknown.luckCycle).toBeNull();
    expect(yearMonth(unknown)).toEqual(['癸卯', '乙丑']);
    expect(unknown.pillars.day.stem.length).toBeGreaterThan(0);
  });
});

describe('BaZi 起运 chain', () => {
  it('takes the forward interval from the next 節 and reports the 起运 date', () => {
    const b = bazi({});
    // 2024-02-04 17:00 HKT -> 驚蟄 2024-03-05 10:23 HKT = 29d17h23m.
    // Existing 3-days-per-year rule: 9y10m26d (minute-precision reference).
    expect(b.luckCycle!.forward).toBe(true);
    expect(b.luckCycle!.startAfter).toEqual({ years: 9, months: 10, days: 26 });
    expect(b.luckCycle!.startSolarDate).toBe('2033-12-31');
    // Year labels are Gregorian and anchored on the 起运 date, not the library's
    // lunar-year name (2032 for this case).
    expect(b.luckCycle!.majorCycles[0]!.startYear).toBe(2033);
    expect(b.luckCycle!.majorCycles[1]!.startYear).toBe(2043);
    expect(b.luckCycle!.majorCycles[0]!.startYear - 2024 + 1).toBe(
      b.luckCycle!.majorCycles[0]!.startAge,
    );
    expect(b.luckCycle!.majorCycles[0]!.stem + b.luckCycle!.majorCycles[0]!.branch).toBe('丁卯');
    expect(b.luckCycle!.majorCycles[1]!.stem + b.luckCycle!.majorCycles[1]!.branch).toBe('戊辰');
  });

  it('takes the backward interval from the previous 節 and reports the 起运 date', () => {
    const b = bazi({ ruleGender: 'female' });
    // 立春 2024-02-04 16:27 HKT -> birth 17:00 = 33m -> 0y0m2d under the same rule.
    expect(b.luckCycle!.forward).toBe(false);
    expect(b.luckCycle!.startAfter).toEqual({ years: 0, months: 0, days: 2 });
    expect(b.luckCycle!.startSolarDate).toBe('2024-02-07');
    // 2024-02-07 is still lunar year 2023 (CNY 2024 is 02-10); the label must be 2024.
    expect(b.luckCycle!.majorCycles[0]!.startYear).toBe(2024);
    expect(b.luckCycle!.majorCycles[1]!.startYear).toBe(2034);
    expect(b.luckCycle!.majorCycles[0]!.startYear - 2024 + 1).toBe(
      b.luckCycle!.majorCycles[0]!.startAge,
    );
    expect(b.luckCycle!.majorCycles[0]!.stem + b.luckCycle!.majorCycles[0]!.branch).toBe('乙丑');
    expect(b.luckCycle!.majorCycles[1]!.stem + b.luckCycle!.majorCycles[1]!.branch).toBe('甲子');
  });

  it('labels a 起运 date that crosses both the Gregorian and lunar year', () => {
    // Birth 2024-02-04 16:30 HKT is 3 minutes after 立春; the forward interval to
    // 驚蟄 starts the luck cycle on 2034-01-03 (Gregorian 2034, lunar 2033).
    const b = bazi({ localTime: '16:30:00' });
    expect(b.luckCycle!.forward).toBe(true);
    expect(b.luckCycle!.startSolarDate).toBe('2034-01-03');
    expect(b.luckCycle!.majorCycles[0]!.startYear).toBe(2034);
    expect(b.luckCycle!.majorCycles[1]!.startYear).toBe(2044);
    expect(b.luckCycle!.majorCycles[0]!.startYear - 2024 + 1).toBe(
      b.luckCycle!.majorCycles[0]!.startAge,
    );
  });

  it('does not apply the first 大运 to a target year before the 起运 date', () => {
    const before = runInterpret(parseBirthInput(base), {
      now: NOW,
      at: { solarDate: '2032-06-01', timeIndex: 6 },
    }).interpretation;
    const firstYear = before.facts.find((f) => f.claim.startsWith('2032('));
    expect(firstYear).toBeDefined();
    expect(firstYear!.claim).not.toContain('大运');

    const inside = runInterpret(parseBirthInput(base), {
      now: NOW,
      at: { solarDate: '2042-06-01', timeIndex: 6 },
    }).interpretation;
    const lastYear = inside.facts.find((f) => f.claim.startsWith('2042('));
    expect(lastYear).toBeDefined();
    expect(lastYear!.claim).toContain('合大运卯');
    const label = inside.facts.find((f) => f.claim.includes('丁卯大运'));
    expect(label!.claim).toContain('2033年起');
  });

  it('is deterministic and unaffected by other locations computed in between', () => {
    const original = canonicalJson(bazi({}));
    bazi({ localTime: '04:00:00', timezone: 'America/New_York', location: NEW_YORK });
    bazi({ localDate: '2024-03-10', localTime: '02:00:00', timezone: 'Pacific/Kiritimati' });
    expect(canonicalJson(bazi({}))).toBe(original);
  });
});

describe('downstream answer path uses the corrected pillars', () => {
  it('answer-plan exposes 甲辰/丙寅 for the same instant expressed in New York', () => {
    const input = parseBirthInput({
      ...base,
      localTime: '04:00:00',
      timezone: 'America/New_York',
      location: NEW_YORK,
      settings: { systems: ['bazi', 'ziwei', 'western', 'vedic'] },
    });
    const { publicResult } = runAnswerPlan(input, { now: NOW, topic: 'general' });
    const fourPillars = publicResult.facts.find((f) => f.claim.startsWith('四柱'));
    expect(fourPillars).toBeDefined();
    expect(fourPillars!.claim).toContain('甲辰');
    expect(fourPillars!.claim).toContain('丙寅');
  });
});
