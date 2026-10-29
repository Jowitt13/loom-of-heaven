// Tests for the western-tropical-placidus ruleset version lifecycle:
// - Default rulesetId is 0.2.1
// - Explicit 0.2.1 works
// - Retired 0.2.0 and 0.1.0 are rejected with RULESET_UNSUPPORTED
// - The retirement check also runs on the unknown-time path
// - Error message structure is stable and does not leak internals
import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  EngineError,
  WESTERN_RULESET_CURRENT,
  WESTERN_RULESET_RETIRED,
  WesternSettings,
} from '@loom/contracts';
import { computeWestern } from '../src/western-provider.ts';
import { NormalizedBirthData } from '@loom/contracts';

/** A minimal valid NormalizedBirthData for exercising the provider (synthetic). */
const SYNTHETIC_INPUT = NormalizedBirthData.parse({
  schemaVersion: '0.1.0',
  calendar: 'gregorian',
  timeAccuracy: 'exact',
  timeKnown: true,
  localDate: '2000-01-01',
  localTime: '20:00:00',
  localCivilIso: '2000-01-01T20:00:00+08:00',
  timezone: 'Asia/Shanghai',
  timezoneOffsetMinutes: 480,
  utcInstant: '2000-01-01T12:00:00.000Z',
  utcInstantMs: Date.UTC(2000, 0, 1, 12, 0, 0),
  ambiguity: { status: 'unambiguous', candidateCount: 1 },
  location: { latitude: 30.0, longitude: 120.0, source: 'user' },
  solar: null,
  tzdb: { version: '2024a', source: 'moment-timezone' },
});

/** Same instant with an unknown birth time; no angles/houses are produced. */
const UNKNOWN_TIME_INPUT = NormalizedBirthData.parse({
  ...SYNTHETIC_INPUT,
  timeAccuracy: 'unknown',
  timeKnown: false,
});

describe('western ruleset version lifecycle', () => {
  it('default rulesetId is western-tropical-placidus@0.2.1', () => {
    const parsed = WesternSettings.parse({});
    expect(parsed.rulesetId).toBe('western-tropical-placidus@0.2.1');
    expect(parsed.rulesetId).toBe(WESTERN_RULESET_CURRENT);
  });

  it('explicit western-tropical-placidus@0.2.1 computes successfully', () => {
    const settings = WesternSettings.parse({ rulesetId: 'western-tropical-placidus@0.2.1' });
    const { result } = computeWestern(SYNTHETIC_INPUT, settings);
    expect(result).not.toBeNull();
    expect(result!.rulesetId).toBe('western-tropical-placidus@0.2.1');
  });

  it.each(WESTERN_RULESET_RETIRED)('retired %s is stably rejected', (retired) => {
    const settings = WesternSettings.parse({ rulesetId: retired });
    let thrown: unknown;
    try {
      computeWestern(SYNTHETIC_INPUT, settings);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(EngineError);
    const err = thrown as EngineError;
    expect(err.code).toBe(ERROR_CODES.RULESET_UNSUPPORTED);
    expect(err.message).toContain(retired);
    expect(err.message).toContain(WESTERN_RULESET_CURRENT);
    expect(err.message).toContain('retired');
  });

  it('retired versions are rejected before the unknown-time path', () => {
    for (const retired of WESTERN_RULESET_RETIRED) {
      const settings = WesternSettings.parse({ rulesetId: retired });
      let thrown: unknown;
      try {
        computeWestern(UNKNOWN_TIME_INPUT, settings);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(EngineError);
      expect((thrown as EngineError).code).toBe(ERROR_CODES.RULESET_UNSUPPORTED);
    }
  });

  it('error from a retired ruleset does not leak internal implementation details', () => {
    const settings = WesternSettings.parse({
      rulesetId: 'western-tropical-placidus@0.2.0',
    });
    let message = '';
    try {
      computeWestern(SYNTHETIC_INPUT, settings);
    } catch (e) {
      message = (e as Error).message;
    }
    // Must not contain stack traces, file paths, or internal function names
    expect(message).not.toMatch(/\.ts:|at \w+|node_modules/);
    // Must not contain the raw internal array reference
    expect(message).not.toContain('WESTERN_RULESET_RETIRED');
  });

  it('unknown western rulesets are stably rejected', () => {
    const settings = WesternSettings.parse({ rulesetId: 'review-nonexistent@9.9.9' });
    let thrown: unknown;
    try {
      computeWestern(SYNTHETIC_INPUT, settings);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(EngineError);
    const err = thrown as EngineError;
    expect(err.code).toBe(ERROR_CODES.RULESET_UNSUPPORTED);
    expect(err.message).toContain(WESTERN_RULESET_CURRENT);
    expect(err.message).not.toMatch(/\.ts:|at \w+|node_modules/);
  });

  it('WESTERN_RULESET_RETIRED contains 0.2.0 and 0.1.0', () => {
    expect(WESTERN_RULESET_RETIRED).toContain('western-tropical-placidus@0.2.0');
    expect(WESTERN_RULESET_RETIRED).toContain('western-tropical-placidus@0.1.0');
  });
});
