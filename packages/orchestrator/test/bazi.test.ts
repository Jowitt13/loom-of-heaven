// Synthetic fixture — fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { canonicalJson, parseBirthInput } from '@loom/contracts';
import type { BirthInputRaw } from '@loom/contracts';
import { calculate } from '../src/index.ts';
import { lunarToGregorian } from '@loom/bazi';

const FIXED = Date.parse('2026-01-01T00:00:00Z');

function bazi(overrides: Partial<BirthInputRaw>) {
  const base: BirthInputRaw = {
    calendar: 'gregorian',
    localDate: '1990-03-10',
    localTime: '08:15:00',
    timeAccuracy: 'exact',
    timezone: 'Asia/Shanghai',
    ruleGender: 'male',
    location: { latitude: 30.5, longitude: 114.3, source: 'user' },
    settings: { systems: ['bazi'] },
  };
  const bundle = calculate(parseBirthInput({ ...base, ...overrides }), { now: FIXED });
  if (!bundle.bazi) throw new Error('expected bazi result');
  return bundle;
}

// Fixed stem -> element table (textbook; independent of the provider).
const STEM_ELEMENT: Record<string, string> = {
  甲: '木',
  乙: '木',
  丙: '火',
  丁: '火',
  戊: '土',
  己: '土',
  庚: '金',
  辛: '金',
  壬: '水',
  癸: '水',
};

describe('BaZi — independent goldens (textbook facts)', () => {
  it('year pillar of the canonical jiazi year 1984 is 甲子 (zodiac 鼠)', () => {
    // 1984 is the start of the 60-year sexagenary cycle; mid-year is after 立春.
    const y = bazi({ localDate: '1984-06-01' }).bazi!.pillars.year;
    expect(y.stem + y.branch).toBe('甲子');
    expect(y.zodiac).toBe('鼠');
  });

  it('year pillar zodiac tracks the animal year (1990 -> 马)', () => {
    expect(bazi({ localDate: '1990-06-01' }).bazi!.pillars.year.zodiac).toBe('马');
  });

  it('day-master element matches the fixed stem->element table', () => {
    for (const date of ['1984-06-01', '1990-03-10', '2000-02-05', '2020-11-20']) {
      const dm = bazi({ localDate: date }).bazi!.dayMaster;
      expect(dm.element).toBe(STEM_ELEMENT[dm.stem]);
    }
  });

  it('na yin of a 甲戌 day is 山头火 (textbook na-yin table)', () => {
    const day = bazi({}).bazi!.pillars.day;
    expect(day.stem + day.branch).toBe('甲戌');
    expect(day.naYin).toBe('山头火');
  });

  it('hidden stems of 戌 are 戊(main)/辛/丁 with ten gods vs day master 甲', () => {
    const hidden = bazi({}).bazi!.pillars.day.hiddenStems;
    expect(hidden.map((h) => h.stem)).toEqual(['戊', '辛', '丁']);
    expect(hidden[0]!.primary).toBe(true);
    // 甲 day master: 戊=偏财, 辛=正官, 丁=伤官 (standard ten-god relations).
    expect(hidden.map((h) => h.tenGod)).toEqual(['偏财', '正官', '伤官']);
  });

  it('ten god of 甲 day master vs 己 month stem is 正财', () => {
    expect(bazi({}).bazi!.pillars.month.tenGod).toBe('正财');
  });

  it('the day pillar repeats every 60 days (sexagenary continuity)', () => {
    // 2000-01-01 + 60 days = 2000-03-01 (Jan 31 + Feb 29).
    const a = bazi({ localDate: '2000-01-01' }).bazi!.pillars.day;
    const b = bazi({ localDate: '2000-03-01' }).bazi!.pillars.day;
    expect(a.stem + a.branch).toBe(b.stem + b.branch);
  });
});

describe('lunar -> gregorian conversion (Chinese New Year is public record)', () => {
  const iso = (y: number) => {
    const g = lunarToGregorian(y, 1, 1, false);
    return `${g.year}-${String(g.month).padStart(2, '0')}-${String(g.day).padStart(2, '0')}`;
  };
  it('maps lunar new year to the known Gregorian date', () => {
    expect(iso(1984)).toBe('1984-02-02');
    expect(iso(1990)).toBe('1990-01-27');
    expect(iso(2000)).toBe('2000-02-05');
    expect(iso(2024)).toBe('2024-02-10');
  });
  it('distinguishes a leap month from the ordinary month (1990 leap 5th)', () => {
    const ordinary = lunarToGregorian(1990, 5, 1, false);
    const leap = lunarToGregorian(1990, 5, 1, true);
    expect(`${leap.year}-${leap.month}-${leap.day}`).not.toBe(
      `${ordinary.year}-${ordinary.month}-${ordinary.day}`,
    );
  });
  it('calculate() converts lunar input and warns (LUNAR_CONVERTED)', () => {
    const bundle = bazi({ calendar: 'lunar', localDate: '1990-01-01', ruleGender: 'male' });
    expect(bundle.warnings.some((w) => w.code === 'LUNAR_CONVERTED')).toBe(true);
    expect(bundle.normalizedTime.localCivil.startsWith('1990-01-27')).toBe(true);
  });
});

describe('BaZi — behavior & determinism', () => {
  it('regression snapshot: 1990-03-10 08:15 (male) pillars + first luck cycle', () => {
    const b = bazi({}).bazi!;
    const p = b.pillars;
    expect([p.year, p.month, p.day, p.hour].map((x) => x!.stem + x!.branch)).toEqual([
      '庚午',
      '己卯',
      '甲戌',
      '戊辰',
    ]);
    expect(b.luckCycle!.forward).toBe(true);
    expect(b.luckCycle!.startAfter).toEqual({ years: 8, months: 8, days: 4 });
    const first = b.luckCycle!.majorCycles[0]!;
    expect(first.stem + first.branch).toBe('庚辰');
    expect(first.startYear).toBe(1998);
  });

  it('omits the luck cycle (with a warning) when gender is unspecified', () => {
    const bundle = bazi({ ruleGender: 'unspecified' });
    expect(bundle.bazi!.luckCycle).toBeNull();
    expect(bundle.warnings.some((w) => w.code === 'BAZI_GENDER_REQUIRED')).toBe(true);
  });

  it('omits the hour pillar and luck cycle when the birth time is unknown', () => {
    const bundle = bazi({ timeAccuracy: 'unknown', localTime: undefined });
    expect(bundle.bazi!.pillars.hour).toBeNull();
    expect(bundle.bazi!.luckCycle).toBeNull();
    // Year/month/day pillars are still produced from the date anchor.
    expect(bundle.bazi!.pillars.day.stem.length).toBeGreaterThan(0);
  });

  it('is deterministic (byte-identical BaZi across runs)', () => {
    expect(canonicalJson(bazi({}).bazi)).toBe(canonicalJson(bazi({}).bazi));
  });

  it('records the tyme4ts provider and bazi ruleset in provenance', () => {
    const bundle = bazi({});
    expect(bundle.provenance.providers.some((p) => p.id === 'tyme4ts')).toBe(true);
    expect(bundle.provenance.rulesets.some((r) => r.id === 'bazi-standard')).toBe(true);
  });
});
