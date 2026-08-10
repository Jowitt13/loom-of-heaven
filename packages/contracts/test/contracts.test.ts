// Synthetic fixture — fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { BirthInput, canonicalJson, fnv1a64Hex, parseBirthInput, roundTo } from '@loom/contracts';

// Valid base WITHOUT localTime, so we can test the localTime refinement cleanly.
const base = {
  calendar: 'gregorian',
  localDate: '1990-06-15',
  timeAccuracy: 'exact',
  timezone: 'Asia/Shanghai',
  location: { latitude: 31.23, longitude: 121.47, source: 'user' },
};

describe('BirthInput schema', () => {
  it('applies nested defaults via prefault', () => {
    const parsed = parseBirthInput({ ...base, localTime: '14:30' });
    expect(parsed.settings.systems).toEqual(['western', 'bazi', 'ziwei', 'vedic']);
    expect(parsed.settings.western.houseSystem).toBe('placidus');
    expect(parsed.settings.western.nodes).toBe('true');
    expect(parsed.settings.bazi.dayBoundary).toBe('zi-hour');
    expect(parsed.settings.ziwei.rulesetId).toBe('iztro-default@0.1.0');
    expect(parsed.settings.vedic.nodes).toBe('mean');
    expect(parsed.schemaVersion.length).toBeGreaterThan(0);
  });

  it('rejects unknown top-level keys (strict)', () => {
    expect(BirthInput.safeParse({ ...base, localTime: '14:30', bogus: 1 }).success).toBe(false);
  });

  it('requires localTime unless timeAccuracy is unknown', () => {
    expect(BirthInput.safeParse(base).success).toBe(false);
    expect(BirthInput.safeParse({ ...base, timeAccuracy: 'unknown' }).success).toBe(true);
  });

  it('rejects out-of-range coordinates', () => {
    const bad = {
      ...base,
      localTime: '14:30',
      location: { latitude: 100, longitude: 0, source: 'user' },
    };
    expect(BirthInput.safeParse(bad).success).toBe(false);
  });
});

describe('canonical JSON + hashing', () => {
  it('is independent of key order', () => {
    const a = canonicalJson({ b: 1, a: [3, 2, 1], c: { y: 1, x: 2 } });
    const b = canonicalJson({ c: { x: 2, y: 1 }, a: [3, 2, 1], b: 1 });
    expect(a).toBe(b);
  });

  it('drops undefined members deterministically', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('fnv1a64Hex is deterministic and input-sensitive', () => {
    expect(fnv1a64Hex('abc')).toBe(fnv1a64Hex('abc'));
    expect(fnv1a64Hex('abc')).not.toBe(fnv1a64Hex('abd'));
    expect(fnv1a64Hex('x')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('roundTo rounds to fixed decimals', () => {
    expect(roundTo(1.23456, 2)).toBe(1.23);
    expect(roundTo(465.6, 4)).toBe(465.6);
  });
});
