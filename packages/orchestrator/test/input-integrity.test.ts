import { describe, expect, it } from 'vitest';
import {
  BAZI_RULESET_CURRENT,
  ERROR_CODES,
  EngineError,
  VEDIC_RULESET_CURRENT,
  WESTERN_RULESET_CURRENT,
  ZIWEI_RULESET_CURRENT,
  parseBirthInput,
} from '@loom/contracts';
import { normalizeBirthData } from '@loom/time-location';
import { calculate, runInterpret, runNormalize } from '@loom/orchestrator';

// Synthetic fixture — fictional data only; not a real person.
const raw = {
  calendar: 'gregorian',
  localDate: '1990-06-15',
  localTime: '08:30',
  timeAccuracy: 'exact',
  timezone: 'Asia/Shanghai',
  location: { latitude: 31.23, longitude: 121.47, source: 'user' },
  ruleGender: 'male',
} as const;
const FIXED = Date.parse('2026-01-01T00:00:00Z');
const ALL_SYSTEMS = ['western', 'bazi', 'ziwei', 'vedic'] as const;

function settingsFor(system: string, rulesetId: string): Record<string, unknown> {
  return { systems: [system], [system]: { rulesetId } };
}

function thrownBy(fn: () => unknown): EngineError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(EngineError);
    return err as EngineError;
  }
  throw new Error('expected an EngineError');
}

describe('lunar conversion versus the normalization boundary', () => {
  const lunar = {
    ...raw,
    calendar: 'lunar',
    localDate: '2023-02-30',
    lunarLeapMonth: false,
  } as const;

  it('runNormalize converts the admitted lunar input before normalizing', () => {
    const { normalized, warnings } = runNormalize(parseBirthInput(lunar));
    expect(normalized.localDate).toBe('2023-03-21');
    expect(normalized.localCivilIso.startsWith('2023-03-21T08:30:00')).toBe(true);
    expect(warnings.map((warning) => warning.code)).toContain('LUNAR_CONVERTED');
  });

  it('normalizeBirthData does not accept an unconverted lunar input', () => {
    const err = thrownBy(() => normalizeBirthData(parseBirthInput(lunar)));
    expect(err.code).toBe(ERROR_CODES.LUNAR_CONVERSION_UNAVAILABLE);
  });
});

describe('ruleset version authenticity', () => {
  it.each(ALL_SYSTEMS)('rejects a fabricated %s ruleset before computing', (system) => {
    const input = parseBirthInput({
      ...raw,
      settings: settingsFor(system, 'review-nonexistent@9.9.9'),
    });
    const err = thrownBy(() => calculate(input, { now: FIXED }));
    expect(err.code).toBe(ERROR_CODES.RULESET_UNSUPPORTED);
  });

  it('does not let missing time or gender bypass the version check', () => {
    for (const system of ['bazi', 'ziwei', 'vedic'] as const) {
      const input = parseBirthInput({
        ...raw,
        localTime: undefined,
        timeAccuracy: 'unknown',
        ruleGender: undefined,
        settings: settingsFor(system, 'review-nonexistent@9.9.9'),
      });
      const err = thrownBy(() => calculate(input, { now: FIXED }));
      expect(err.code).toBe(ERROR_CODES.RULESET_UNSUPPORTED);
    }
  });

  it('rejects the retired bazi-standard@0.1.0 before time/gender early returns', () => {
    for (const overrides of [
      {},
      { localTime: undefined, timeAccuracy: 'unknown', ruleGender: undefined },
    ]) {
      const input = parseBirthInput({
        ...raw,
        ...overrides,
        settings: settingsFor('bazi', 'bazi-standard@0.1.0'),
      });
      const err = thrownBy(() => calculate(input, { now: FIXED }));
      expect(err.code).toBe(ERROR_CODES.RULESET_UNSUPPORTED);
      expect(err.exitCode).toBe(10);
      expect(err.message).toContain('retired');
      expect(err.detail).toMatchObject({
        requestedRuleset: 'bazi-standard@0.1.0',
        currentRuleset: BAZI_RULESET_CURRENT,
      });
    }
  });

  it('accepts the default and explicit bazi-standard@0.1.1', () => {
    for (const settings of [{ systems: ['bazi'] }, settingsFor('bazi', 'bazi-standard@0.1.1')]) {
      const bundle = calculate(parseBirthInput({ ...raw, settings }), { now: FIXED });
      expect(bundle.bazi?.rulesetId).toBe('bazi-standard@0.1.1');
    }
  });

  it('accepts the implemented version of every system and records only that version', () => {
    const input = parseBirthInput({ ...raw, settings: { systems: [...ALL_SYSTEMS] } });
    const bundle = calculate(input, { now: FIXED });
    expect(bundle.western?.rulesetId).toBe(WESTERN_RULESET_CURRENT);
    expect(bundle.bazi?.rulesetId).toBe(BAZI_RULESET_CURRENT);
    expect(bundle.ziwei?.rulesetId).toBe(ZIWEI_RULESET_CURRENT);
    expect(bundle.vedic?.rulesetId).toBe(VEDIC_RULESET_CURRENT);
    expect(bundle.provenance.rulesets).toEqual(
      expect.arrayContaining([
        { id: 'western-tropical-placidus', version: '0.2.0' },
        { id: 'bazi-standard', version: '0.1.1' },
        { id: 'iztro-default', version: '0.1.0' },
        { id: 'vedic-parashara-lahiri', version: '0.1.0' },
      ]),
    );
    expect(JSON.stringify(bundle)).not.toContain('review-nonexistent');
  });

  it('keeps existing legal settings and their fallback warnings intact', () => {
    const input = parseBirthInput({
      ...raw,
      settings: {
        systems: ['bazi'],
        bazi: { dayBoundary: 'midnight', earlyLateZi: 'early', rulesetId: BAZI_RULESET_CURRENT },
      },
    });
    const bundle = calculate(input, { now: FIXED });
    expect(bundle.warnings.map((warning) => warning.code)).toContain('RULESET_VARIANT_DEFAULTED');
    expect(bundle.bazi?.rulesetId).toBe(BAZI_RULESET_CURRENT);
  });
});

describe('BaZi interpretation ruleset provenance', () => {
  it('records bazi-rules-ziping only when bazi interpretation actually ran', () => {
    const withBazi = runInterpret(parseBirthInput({ ...raw, settings: { systems: ['bazi'] } }), {
      now: FIXED,
    }).interpretation;
    expect(withBazi.rulesets).toContainEqual({ id: 'bazi-standard', version: '0.1.1' });
    expect(withBazi.rulesets).toContainEqual({ id: 'bazi-rules-ziping', version: '0.1.0' });

    const westernOnly = runInterpret(
      parseBirthInput({ ...raw, settings: { systems: ['western'] } }),
      { now: FIXED },
    ).interpretation;
    expect(westernOnly.rulesets.some((ruleset) => ruleset.id.startsWith('bazi'))).toBe(false);
  });
});
