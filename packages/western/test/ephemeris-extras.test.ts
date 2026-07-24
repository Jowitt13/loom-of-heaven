import { describe, expect, it } from 'vitest';
import {
  ASTEROID_BODIES,
  asteroidPlacement,
  meanNorthNodeLongitude,
  trueNorthNodeLongitude,
  trueNodePlacement,
} from '../src/ephemeris.ts';
import { ayanamshaDegrees, toSidereal } from '../src/zodiac.ts';

const DATES = [
  Date.UTC(1955, 3, 18, 22, 10),
  Date.UTC(1990, 2, 10, 0, 15),
  Date.UTC(2026, 4, 20, 6, 0),
];

describe('true lunar node (osculating)', () => {
  it('stays within ~1.6° of the mean node and is a valid longitude', () => {
    for (const ms of DATES) {
      const t = trueNorthNodeLongitude(ms);
      const m = meanNorthNodeLongitude(ms);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(360);
      let d = Math.abs(t - m);
      if (d > 180) d = 360 - d;
      expect(d).toBeLessThan(1.6);
    }
  });

  it('generally regresses (node speed is usually negative)', () => {
    // Averaged over the sample the true node moves backward like the mean node.
    const avg = DATES.reduce((s, ms) => s + trueNodePlacement(ms).speedDegPerDay, 0) / DATES.length;
    expect(avg).toBeLessThan(0);
  });
});

describe('asteroids (approximate, element-based)', () => {
  it('every asteroid yields a valid longitude, latitude and boolean retrograde', () => {
    for (const body of ASTEROID_BODIES) {
      for (const ms of DATES) {
        const p = asteroidPlacement(body, ms);
        expect(p.longitudeDeg).toBeGreaterThanOrEqual(0);
        expect(p.longitudeDeg).toBeLessThan(360);
        expect(Math.abs(p.latitudeDeg)).toBeLessThan(40);
        expect(typeof p.retrograde).toBe('boolean');
      }
    }
  });

  it('main-belt asteroids move (non-zero daily motion)', () => {
    for (const body of ['Ceres', 'Pallas', 'Juno', 'Vesta'] as const) {
      expect(Math.abs(asteroidPlacement(body, DATES[1]!).speedDegPerDay)).toBeGreaterThan(0);
    }
  });
});

describe('ayanamsha / sidereal', () => {
  it('Lahiri is ~23.85° near J2000 and grows ~50.3″/yr', () => {
    const j2000 = ayanamshaDegrees('lahiri', Date.UTC(2000, 0, 1, 12));
    expect(j2000).toBeCloseTo(23.8523, 2);
    const y2020 = ayanamshaDegrees('lahiri', Date.UTC(2020, 0, 1, 12));
    expect(y2020 - j2000).toBeCloseTo((50.2909 / 3600) * 20, 2);
  });

  it('toSidereal subtracts the ayanamsha (wrap-aware)', () => {
    const ms = Date.UTC(2000, 0, 1, 12);
    expect(toSidereal(10, 'lahiri', ms)).toBeCloseTo(
      (10 - ayanamshaDegrees('lahiri', ms) + 360) % 360,
      6,
    );
  });
});
