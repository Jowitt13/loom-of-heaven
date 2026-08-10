// Synthetic fixture — fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { canonicalJson, parseBirthInput } from '@loom/contracts';
import type { BirthInputRaw } from '@loom/contracts';
import { calculate, runHoroscope } from '@loom/orchestrator';

const base: BirthInputRaw = {
  calendar: 'gregorian',
  localDate: '1990-03-10',
  localTime: '08:15:00',
  timeAccuracy: 'exact',
  timezone: 'Asia/Shanghai',
  location: { latitude: 30.5, longitude: 114.3, source: 'user' },
  ruleGender: 'male',
  settings: { systems: ['ziwei'] },
};

function run(at: { solarDate: string; timeIndex: number }, overrides: Partial<BirthInputRaw> = {}) {
  return runHoroscope(parseBirthInput({ ...base, ...overrides }), at);
}

// 2026-05-20 14:00 → timeIndex for 未时 is 7.
const AT = { solarDate: '2026-05-20', timeIndex: 7 };

function h(overrides: Partial<BirthInputRaw> = {}) {
  return run(AT, overrides).horoscope;
}

describe('Zi Wei dynamic chart (运限盘) via iztro horoscope()', () => {
  it('computes all six limits with provenance and the target echo', () => {
    const { horoscope } = run(AT);
    expect(horoscope).not.toBeNull();
    expect(horoscope!.provider.id).toBe('iztro');
    expect(horoscope!.targetSolarDate).toBe('2026-05-20');
    expect(horoscope!.targetTimeIndex).toBe(7);
    const g = horoscope!.horoscope;
    for (const key of ['decadal', 'age', 'yearly', 'monthly', 'daily', 'hourly'] as const) {
      expect(g[key].heavenlyStem.length).toBeGreaterThan(0);
      expect(g[key].earthlyBranch.length).toBeGreaterThan(0);
      expect(g[key].palaceNames).toHaveLength(12);
    }
  });

  it('流年 for 2026 is 丙午 (year stem-branch regression)', () => {
    expect(h()!.horoscope.yearly.heavenlyStem).toBe('丙');
    expect(h()!.horoscope.yearly.earthlyBranch).toBe('午');
  });

  it('流月 for 丙午年四月 is 巳月 (monthly branch regression)', () => {
    expect(h()!.horoscope.monthly.earthlyBranch).toBe('巳');
  });

  it('小限 carries the nominal age (虚岁 37 for 1990→2026)', () => {
    expect(h()!.horoscope.age.nominalAge).toBe(37);
  });

  it('运限四化 is populated for the yearly limit (丙 → 天同/天机/文昌/廉贞)', () => {
    const mutagen = h()!.horoscope.yearly.mutagen;
    expect(mutagen).toHaveLength(4);
    expect(mutagen).toContain('廉贞');
  });

  it('流年 carries 将前十二星 / 岁前十二星 (twelve each)', () => {
    const dec = h()!.horoscope.yearly.yearlyDecStar;
    expect(dec.jiangqian12).toHaveLength(12);
    expect(dec.suiqian12).toHaveLength(12);
  });

  it('is deterministic (byte-identical across runs)', () => {
    expect(canonicalJson(run(AT).horoscope)).toBe(canonicalJson(run(AT).horoscope));
  });

  it('natal chart records 三方四正 (命宫 → opposite 迁移 / wealth 财帛 / career 官禄)', () => {
    const bundle = calculate(parseBirthInput(base));
    const soul = bundle.ziwei!.palaces.find((p) => p.isSoulPalace)!;
    expect(soul.surroundPalaces.opposite).toBe('迁移');
    expect(soul.surroundPalaces.wealth).toBe('财帛');
    expect(soul.surroundPalaces.career).toBe('官禄');
  });

  it('missing gender rule → horoscope omitted with ZIWEI_INPUT_REQUIRED (not fabricated)', () => {
    const { horoscope: g, warnings } = run(AT, { ruleGender: 'unspecified' });
    expect(g).toBeNull();
    expect(warnings.some((w) => w.code === 'ZIWEI_INPUT_REQUIRED')).toBe(true);
  });

  it('unknown birth time → horoscope omitted with ZIWEI_INPUT_REQUIRED (not fabricated)', () => {
    const { horoscope: g, warnings } = run(AT, {
      timeAccuracy: 'unknown',
      localTime: undefined,
    });
    expect(g).toBeNull();
    expect(warnings.some((w) => w.code === 'ZIWEI_INPUT_REQUIRED')).toBe(true);
  });
});
