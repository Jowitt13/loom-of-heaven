// Synthetic fixture — fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { canonicalJson, parseBirthInput } from '@ming/contracts';
import type { BirthInputRaw } from '@ming/contracts';
import { calculate } from '../src/index.ts';

const FIXED = Date.parse('2026-01-01T00:00:00Z');

function ziwei(overrides: Partial<BirthInputRaw>) {
  const base: BirthInputRaw = {
    calendar: 'gregorian',
    localDate: '1990-03-10',
    localTime: '08:15:00',
    timeAccuracy: 'exact',
    timezone: 'Asia/Shanghai',
    ruleGender: 'male',
    location: { latitude: 30.5, longitude: 114.3, source: 'user' },
    settings: { systems: ['ziwei'] },
  };
  return calculate(parseBirthInput({ ...base, ...overrides }), { now: FIXED });
}

describe('Zi Wei — independent goldens', () => {
  it('zodiac sign (星座) matches the birth date (astronomy fact)', () => {
    // 1990-03-10 is Pisces; 2000-08-16 is Leo.
    expect(ziwei({}).ziwei!.sign).toBe('双鱼座');
    expect(ziwei({ localDate: '2000-08-16' }).ziwei!.sign).toBe('狮子座');
  });

  it('zodiac animal (生肖) tracks the year (1990 -> 马)', () => {
    expect(ziwei({}).ziwei!.zodiac).toBe('马');
  });

  it('has exactly twelve unique palaces, one soul and one body palace', () => {
    const z = ziwei({}).ziwei!;
    expect(z.palaces).toHaveLength(12);
    expect(new Set(z.palaces.map((p) => p.name)).size).toBe(12);
    expect(z.palaces.filter((p) => p.isSoulPalace)).toHaveLength(1);
    expect(z.palaces.filter((p) => p.isBodyPalace)).toHaveLength(1);
    expect(z.palaces.some((p) => p.name === '命宫')).toBe(true);
  });

  it('soul-palace branch matches the 命宫 palace and major limits are 10-year spans', () => {
    const z = ziwei({}).ziwei!;
    const soul = z.palaces.find((p) => p.isSoulPalace)!;
    expect(z.soulPalaceBranch).toBe(soul.earthlyBranch);
    for (const palace of z.palaces) {
      expect(palace.decadal.endAge - palace.decadal.startAge).toBe(9);
    }
    expect(z.fiveElementsClass.endsWith('局')).toBe(true);
  });
});

describe('Zi Wei — regression snapshot (iztro-default ruleset)', () => {
  it('1990-03-10 08:15 (male): soul/body/class and 命宫 stars', () => {
    const z = ziwei({}).ziwei!;
    expect(z.soul).toBe('巨门');
    expect(z.body).toBe('火星');
    expect(z.fiveElementsClass).toBe('土五局');
    const soul = z.palaces.find((p) => p.isSoulPalace)!;
    expect(soul.heavenlyStem + soul.earthlyBranch).toBe('丁亥');
    expect(soul.majorStars.map((s) => s.name + (s.mutagen ? `(${s.mutagen})` : '')).sort()).toEqual(
      ['武曲(权)', '破军'],
    );
  });
});

describe('Zi Wei — behavior & determinism', () => {
  it('is not computed (with a warning) when gender is unspecified', () => {
    const bundle = ziwei({ ruleGender: 'unspecified' });
    expect(bundle.ziwei).toBeUndefined();
    expect(bundle.warnings.some((w) => w.code === 'ZIWEI_INPUT_REQUIRED')).toBe(true);
  });

  it('is not computed (with a warning) when the birth time is unknown', () => {
    const bundle = ziwei({ timeAccuracy: 'unknown', localTime: undefined });
    expect(bundle.ziwei).toBeUndefined();
    expect(bundle.warnings.some((w) => w.code === 'ZIWEI_INPUT_REQUIRED')).toBe(true);
  });

  it('records the iztro provider and iztro ruleset in provenance', () => {
    const bundle = ziwei({});
    expect(bundle.provenance.providers.some((p) => p.id === 'iztro')).toBe(true);
    expect(bundle.provenance.rulesets.some((r) => r.id === 'iztro-default')).toBe(true);
  });

  it('is deterministic (byte-identical Zi Wei across runs)', () => {
    expect(canonicalJson(ziwei({}).ziwei)).toBe(canonicalJson(ziwei({}).ziwei));
  });
});
