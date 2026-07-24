// Synthetic fixture — fictional data only; not a real person.
import { describe, expect, it } from 'vitest';
import { Horizon, Observer } from 'astronomy-engine';
import { ERROR_CODES, EngineError } from '@ming/contracts';
import { deltaLon, norm360 } from '../src/ephemeris.ts';
import {
  ascendantLongitude,
  computeHouseCusps,
  mcLongitude,
  meanObliquityDeg,
  ramcDeg,
  type HouseSystemId,
} from '../src/houses.ts';
import { computeAspects } from '../src/aspects.ts';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const sinD = (d: number): number => Math.sin(d * DEG);
const cosD = (d: number): number => Math.cos(d * DEG);
const asinD = (x: number): number => Math.asin(x) * RAD;
const atan2D = (y: number, x: number): number => norm360(Math.atan2(y, x) * RAD);

/** Right ascension (degrees) of an ecliptic point at longitude λ (β=0). */
function lambdaToRa(lambda: number, eps: number): number {
  return atan2D(cosD(eps) * sinD(lambda), cosD(lambda));
}
/** Declination (degrees) of an ecliptic point at longitude λ (β=0). */
function lambdaToDec(lambda: number, eps: number): number {
  return asinD(sinD(eps) * sinD(lambda));
}
function wrapAbs(a: number, b: number): number {
  return Math.abs(deltaLon(a, b));
}

const CASES = [
  { name: 'Wuhan 1990-03-10', dateMs: Date.UTC(1990, 2, 10, 0, 15), lat: 30.5, lon: 114.3 },
  { name: 'New York 2000-07-04', dateMs: Date.UTC(2000, 6, 4, 16, 0), lat: 40.7, lon: -74.0 },
  { name: 'Sydney 2010-12-21', dateMs: Date.UTC(2010, 11, 21, 3, 30), lat: -33.9, lon: 151.2 },
];

describe('chart angles vs independent oracles', () => {
  for (const { name, dateMs, lat, lon } of CASES) {
    it(`${name}: MC's right ascension equals RAMC`, () => {
      const eps = meanObliquityDeg(dateMs);
      const ramc = ramcDeg(dateMs, lon);
      const mc = mcLongitude(ramc, eps);
      expect(wrapAbs(lambdaToRa(mc, eps), ramc)).toBeLessThanOrEqual(0.01);
    });

    it(`${name}: computed Ascendant sits on the eastern horizon (astronomy-engine Horizon)`, () => {
      const eps = meanObliquityDeg(dateMs);
      const ramc = ramcDeg(dateMs, lon);
      const asc = ascendantLongitude(ramc, lat, eps);
      // Cross-check with astronomy-engine's independent horizon model. The Ascendant is
      // the GEOMETRIC horizon, so we do NOT apply atmospheric refraction (that would lift
      // a horizon point by ~0.5°); the point must have altitude ~0 and an eastern azimuth.
      const observer = new Observer(lat, lon, 0);
      const hor = Horizon(
        new Date(dateMs),
        observer,
        lambdaToRa(asc, eps) / 15,
        lambdaToDec(asc, eps),
      );
      expect(Math.abs(hor.altitude)).toBeLessThanOrEqual(0.05);
      expect(hor.azimuth).toBeGreaterThan(0);
      expect(hor.azimuth).toBeLessThan(180);
    });
  }
});

describe('house systems', () => {
  const ALL: HouseSystemId[] = ['placidus', 'whole-sign', 'equal', 'koch', 'porphyry'];
  const { dateMs, lat, lon } = CASES[0]!;

  it('every system returns 12 cusps with opposite cusps 180° apart', () => {
    for (const system of ALL) {
      const { cusps } = computeHouseCusps(system, dateMs, lat, lon);
      expect(cusps).toHaveLength(12);
      for (let i = 0; i < 6; i++) {
        expect(
          wrapAbs(cusps[i + 6]!, cusps[i]! + 180),
          `${system} cusp ${i + 1}`,
        ).toBeLessThanOrEqual(1e-6);
      }
    }
  });

  it('quadrant systems place house 1 at the Ascendant and house 10 at the MC', () => {
    const eps = meanObliquityDeg(dateMs);
    const ramc = ramcDeg(dateMs, lon);
    const asc = ascendantLongitude(ramc, lat, eps);
    const mc = mcLongitude(ramc, eps);
    // Quadrant systems (placidus/koch/porphyry) always have Asc and MC as cusps 1 and 10.
    for (const system of ['placidus', 'koch', 'porphyry'] as const) {
      const h = computeHouseCusps(system, dateMs, lat, lon);
      expect(wrapAbs(h.cusps[0]!, asc), `${system} cusp1`).toBeLessThanOrEqual(1e-6);
      expect(wrapAbs(h.cusps[9]!, mc), `${system} cusp10`).toBeLessThanOrEqual(1e-6);
    }
    // Equal house: cusp 1 is the Ascendant (cusp 10 is asc+270, not the MC).
    const eq = computeHouseCusps('equal', dateMs, lat, lon);
    expect(wrapAbs(eq.cusps[0]!, asc)).toBeLessThanOrEqual(1e-6);
  });

  it('whole-sign cusps are at 0° of consecutive signs from the Ascendant sign', () => {
    const { cusps } = computeHouseCusps('whole-sign', dateMs, lat, lon);
    for (const cusp of cusps) expect(Math.abs(cusp % 30)).toBeLessThanOrEqual(1e-6);
  });

  it('equal-house cusps are exactly 30° apart starting at the Ascendant', () => {
    const eps = meanObliquityDeg(dateMs);
    const asc = ascendantLongitude(ramcDeg(dateMs, lon), lat, eps);
    const { cusps } = computeHouseCusps('equal', dateMs, lat, lon);
    for (let i = 0; i < 12; i++) expect(wrapAbs(cusps[i]!, asc + i * 30)).toBeLessThanOrEqual(1e-6);
  });

  it('placidus intermediate cusps lie inside their quadrant arcs (monotonic order)', () => {
    const { cusps } = computeHouseCusps('placidus', dateMs, lat, lon);
    // Forward arc between consecutive cusps must be positive and < 180 for a sane chart.
    for (let i = 0; i < 12; i++) {
      const arc = norm360(cusps[(i + 1) % 12]! - cusps[i]!);
      expect(arc, `arc ${i + 1}->${i + 2}`).toBeGreaterThan(0);
      expect(arc, `arc ${i + 1}->${i + 2}`).toBeLessThan(180);
    }
  });

  it('whole-sign and equal house systems work even at extreme latitude', () => {
    for (const system of ['whole-sign', 'equal'] as const) {
      expect(() => computeHouseCusps(system, dateMs, 78, lon)).not.toThrow();
    }
  });

  it('quadrant systems fail at high latitude instead of fabricating cusps', () => {
    // At 78°N, some semi-arc becomes undefined (|tan φ·tan δ| > 1), so Placidus/Koch
    // must raise HOUSE_SYSTEM_UNAVAILABLE rather than emit a made-up cusp.
    let threw = false;
    try {
      computeHouseCusps('placidus', dateMs, 78, lon);
    } catch (err) {
      threw = err instanceof EngineError && err.code === ERROR_CODES.HOUSE_SYSTEM_UNAVAILABLE;
    }
    expect(threw).toBe(true);
  });
});

describe('aspects', () => {
  const pt = (body: string, longitudeDeg: number, speedDegPerDay = 0) => ({
    body,
    longitudeDeg,
    speedDegPerDay,
  });

  it('detects an exact trine with ~0 orb', () => {
    const aspects = computeAspects([pt('A', 10), pt('B', 130)]);
    const trine = aspects.find((a) => a.type === 'trine');
    expect(trine).toBeDefined();
    expect(trine!.orbDeg).toBeLessThanOrEqual(0.01);
  });

  it('respects the orb boundary (inside vs outside)', () => {
    // Square orb is 7°: 97° separation (orb 7) is in; 97.5° (orb 7.5) is out.
    const inside = computeAspects([pt('A', 0), pt('B', 97)]);
    expect(inside.some((a) => a.type === 'square')).toBe(true);
    const outside = computeAspects([pt('A', 0), pt('B', 97.5)]);
    expect(outside.some((a) => a.type === 'square')).toBe(false);
  });

  it('handles the 0/360 wrap for conjunction', () => {
    const aspects = computeAspects([pt('A', 358), pt('B', 2)]);
    expect(aspects.some((a) => a.type === 'conjunction')).toBe(true);
  });

  it('flags applying vs separating from relative speed', () => {
    // A moves toward B (closing the 90° square): applying.
    const applying = computeAspects([pt('A', 0, 1), pt('B', 91, 0)]);
    const sq = applying.find((a) => a.type === 'square');
    expect(sq?.applying).toBe(true);
  });
});
