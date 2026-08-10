// Synthetic fixture — fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { computeSolarTime, equationOfTimeMinutes, parseWallToMs } from '@loom/time-location';

describe('equation of time', () => {
  it('stays within +/- 20 minutes across the whole year', () => {
    for (let day = 0; day < 365; day += 5) {
      const utcMs = Date.UTC(2001, 0, 1) + day * 86_400_000 + 12 * 3_600_000;
      const eot = equationOfTimeMinutes(utcMs);
      expect(Math.abs(eot)).toBeLessThan(20);
    }
  });

  it('is near a known extremum in early November (~+16 min)', () => {
    // The equation of time peaks around +16.4 min in early November.
    const eot = equationOfTimeMinutes(Date.UTC(2001, 10, 3, 12));
    expect(eot).toBeGreaterThan(14);
    expect(eot).toBeLessThan(18);
  });
});

describe('computeSolarTime', () => {
  it('mean solar time offset from UTC is longitude * 4 minutes', () => {
    const utcMs = Date.UTC(2000, 5, 1, 4, 0, 0); // 04:00Z
    const solar = computeSolarTime(utcMs, 120);
    expect(solar.longitudeOffsetMinutes).toBe(480);
    // 120E mean solar of 04:00Z is 12:00:00 wall.
    expect(solar.meanSolarTimeIso).toBe('2000-06-01T12:00:00');
    expect(solar.method).toBe('noaa-eot@0.1.0');
  });

  it('apparent solar time = mean solar time + equation of time', () => {
    const utcMs = Date.UTC(2000, 10, 3, 4, 0, 0);
    const solar = computeSolarTime(utcMs, 120);
    const meanMs = parseWallToMs('2000-11-03', solar.meanSolarTimeIso.slice(11));
    const apparentMs = parseWallToMs('2000-11-03', solar.apparentSolarTimeIso.slice(11));
    const deltaMin = (apparentMs - meanMs) / 60_000;
    // Within a second of the reported equation of time.
    expect(Math.abs(deltaMin - solar.equationOfTimeMinutes)).toBeLessThan(0.02);
  });

  it('negative longitude yields a negative mean-solar offset', () => {
    const solar = computeSolarTime(Date.UTC(2000, 0, 1, 12), -75);
    expect(solar.longitudeOffsetMinutes).toBe(-300);
  });
});
