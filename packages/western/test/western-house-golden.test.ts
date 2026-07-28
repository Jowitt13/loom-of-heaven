// Independent Swiss Ephemeris house golden — all fixture samples are
// SYNTHETIC technical epochs (not real birth data). This suite is
// FAIL-CLOSED: while the tracked fixture is still the PENDING_CAPTURE
// skeleton, the gate test below FAILS (never skips), so the suite cannot
// silently look green without real captured reference data.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES, EngineError } from '@ming/contracts';
import { deltaLon, norm360 } from '../src/ephemeris.ts';
import { computeHouseCusps, houseOfLongitude, type HouseSystemId } from '../src/houses.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, '..', 'goldens', 'swiss-ephemeris-houses.json');

const SYSTEMS: HouseSystemId[] = ['placidus', 'koch', 'porphyry', 'equal', 'whole-sign'];

interface GoldenSystem {
  cusps: number[]; // index 0 = house 1 ... index 11 = house 12
  ascendant: number;
  mc: number;
  armc: number | null;
}
interface GoldenCase {
  id: string;
  description: string;
  utcIso: string;
  latDeg: number;
  lonEastDeg: number;
  systems: Record<string, GoldenSystem>;
}
interface GoldenFixture {
  status: string;
  source: {
    version: string | null;
    captureDateUtc: string | null;
    rawSha256: Record<string, string>;
  };
  toleranceArcmin: Record<string, number | null>;
  toleranceRationale: string | null;
  cases: GoldenCase[];
}

const fixture: GoldenFixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

/** Wrapped angular distance in ARCMINUTES. */
function wrappedArcmin(a: number, b: number): number {
  return Math.abs(deltaLon(a, b)) * 60;
}

describe('western house golden: fail-closed capture gate', () => {
  it('fixture is populated with captured Swiss Ephemeris data (fails while PENDING_CAPTURE)', () => {
    // This test MUST stay red until the fixture is populated from a real,
    // reviewed swetest capture. Never skip it, never soften it: a pending or
    // half-filled fixture is NOT a passing state.
    expect(fixture.status).toBe('populated');
    expect(fixture.source.version).toBeTruthy();
    expect(fixture.source.captureDateUtc).toBeTruthy();
    expect(Object.keys(fixture.source.rawSha256).length).toBeGreaterThan(0);
    expect(fixture.cases.length).toBeGreaterThanOrEqual(5);
    for (const c of fixture.cases) {
      for (const sys of SYSTEMS) {
        expect(c.systems[sys], `case ${c.id} missing system ${sys}`).toBeDefined();
        expect(c.systems[sys]!.cusps).toHaveLength(12);
      }
    }
    for (const sys of SYSTEMS) {
      const tol = fixture.toleranceArcmin[sys];
      expect(
        typeof tol === 'number' && tol > 0 && tol <= 1,
        `toleranceArcmin.${sys} must be a positive number <= 1 arc-minute, got ${tol}`,
      ).toBe(true);
    }
    expect(fixture.toleranceRationale).toBeTruthy();
  });
});

// Golden comparisons: only meaningful once populated. Guarded by a plain
// conditional (NOT it.skip) so the pending state yields zero green golden
// assertions while the gate test above is red.
if (fixture.status === 'populated') {
  describe('western house golden: engine vs Swiss Ephemeris', () => {
    for (const c of fixture.cases) {
      const dateMs = Date.parse(c.utcIso);
      describe(`${c.id} (${c.description})`, () => {
        for (const sys of SYSTEMS) {
          const golden = c.systems[sys]!;
          const tol = fixture.toleranceArcmin[sys] as number;

          it(`${sys}: angles (ASC/MC/IC/DESC) within ${tol}'`, () => {
            const r = computeHouseCusps(sys, dateMs, c.latDeg, c.lonEastDeg);
            expect(wrappedArcmin(r.ascendant, golden.ascendant)).toBeLessThanOrEqual(tol);
            expect(wrappedArcmin(r.mc, golden.mc)).toBeLessThanOrEqual(tol);
            // IC and Descendant are derived (+180°) — assert against the
            // golden-derived values so a sign/quadrant error cannot hide.
            expect(wrappedArcmin(r.ic, norm360(golden.mc + 180))).toBeLessThanOrEqual(tol);
            expect(
              wrappedArcmin(r.descendant, norm360(golden.ascendant + 180)),
            ).toBeLessThanOrEqual(tol);
          });

          it(`${sys}: all 12 cusps within ${tol}'`, () => {
            const r = computeHouseCusps(sys, dateMs, c.latDeg, c.lonEastDeg);
            for (let i = 0; i < 12; i++) {
              expect(
                wrappedArcmin(r.cusps[i]!, golden.cusps[i]!),
                `house ${i + 1}: engine=${r.cusps[i]} golden=${golden.cusps[i]}`,
              ).toBeLessThanOrEqual(tol);
            }
          });

          it(`${sys}: golden cusp ring closes to 360 degrees`, () => {
            // Ring consistency of the REFERENCE data itself: successive cusp
            // gaps (forward along the ecliptic) must sum to a full circle.
            let sum = 0;
            for (let i = 0; i < 12; i++) {
              const a = golden.cusps[i]!;
              const b = golden.cusps[(i + 1) % 12]!;
              sum += norm360(b - a);
            }
            expect(Math.abs(sum - 360)).toBeLessThanOrEqual(1e-6);
          });
        }

        it('equal: cusps are exactly ASC + 30k (discrete definition)', () => {
          const r = computeHouseCusps('equal', dateMs, c.latDeg, c.lonEastDeg);
          for (let i = 0; i < 12; i++) {
            expect(wrappedArcmin(r.cusps[i]!, norm360(r.ascendant + 30 * i))).toBeLessThanOrEqual(
              1e-6,
            );
          }
        });

        it('whole-sign: every cusp is an exact 30-degree sign boundary containing ASC in house 1', () => {
          const r = computeHouseCusps('whole-sign', dateMs, c.latDeg, c.lonEastDeg);
          for (let i = 0; i < 12; i++) {
            expect(r.cusps[i]! % 30).toBeCloseTo(0, 9);
          }
          const ascSignStart = Math.floor(r.ascendant / 30) * 30;
          expect(r.cusps[0]).toBeCloseTo(ascSignStart, 9);
        });

        it('houseOfLongitude: a point exactly on a cusp belongs to that house (equal + placidus)', () => {
          for (const sys of ['equal', 'placidus'] as const) {
            const r = computeHouseCusps(sys, dateMs, c.latDeg, c.lonEastDeg);
            // Exactly on cusp of house 4 -> must report house 4.
            expect(houseOfLongitude(r.cusps, r.cusps[3]!)).toBe(4);
          }
        });
      });
    }
  });
}

describe('western house golden: high-latitude boundary (engine self-assertion, fixture-independent)', () => {
  // Contract for quadrant systems (Placidus, Koch): whenever the geometry is
  // undefined they must raise HOUSE_SYSTEM_UNAVAILABLE — never silently fall
  // back (Swiss Ephemeris swetest falls back to Porphyry there; this project
  // rejects that fallback). Koch's guard is the MC degree's own semi-arc
  // (undefined when the MC degree is circumpolar); the koch samples below
  // were VERIFIED against the implementation to hit that condition. This
  // does not claim koch fails at every high-latitude instant — whether it
  // does depends on λ_MC at the moment. These assertions deliberately do
  // NOT depend on the golden fixture.
  const HIGH_LAT_CASES = [
    {
      name: 'north circumpolar (synthetic)',
      dateMs: Date.UTC(2001, 5, 21, 0, 0),
      lat: 66.8,
      lon: 25.7,
    },
    {
      name: 'south deep-polar (synthetic)',
      dateMs: Date.UTC(2013, 0, 10, 12, 0),
      lat: -75.0,
      lon: 0.0,
    },
  ];

  for (const { name, dateMs, lat, lon } of HIGH_LAT_CASES) {
    it(`${name}: placidus throws HOUSE_SYSTEM_UNAVAILABLE (no Porphyry fallback accepted)`, () => {
      let thrown: unknown;
      try {
        computeHouseCusps('placidus', dateMs, lat, lon);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(EngineError);
      expect((thrown as EngineError).code).toBe(ERROR_CODES.HOUSE_SYSTEM_UNAVAILABLE);
    });

    for (const sys of ['whole-sign', 'equal', 'porphyry'] as const) {
      it(`${name}: ${sys} still returns a full cusp ring`, () => {
        const r = computeHouseCusps(sys, dateMs, lat, lon);
        expect(r.cusps).toHaveLength(12);
        for (const cusp of r.cusps) {
          expect(Number.isFinite(cusp)).toBe(true);
        }
      });
    }
  }

  // Koch circumpolar-MC samples: at these synthetic instants the MC degree's
  // declination satisfies |tan φ · tan δ_MC| > 1 (verified by probing the
  // implementation across the day at each site), so koch is geometrically
  // undefined and must throw — not fall back.
  const KOCH_CIRCUMPOLAR_CASES = [
    {
      name: 'north circumpolar MC (synthetic, 66.8N 2001-06-21T10:00Z)',
      dateMs: Date.UTC(2001, 5, 21, 10, 0),
      lat: 66.8,
      lon: 25.7,
    },
    {
      name: 'south circumpolar MC (synthetic, 75S 2013-01-10T12:00Z)',
      dateMs: Date.UTC(2013, 0, 10, 12, 0),
      lat: -75.0,
      lon: 0.0,
    },
  ];
  for (const { name, dateMs, lat, lon } of KOCH_CIRCUMPOLAR_CASES) {
    it(`${name}: koch throws HOUSE_SYSTEM_UNAVAILABLE (no Porphyry fallback accepted)`, () => {
      let thrown: unknown;
      try {
        computeHouseCusps('koch', dateMs, lat, lon);
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(EngineError);
      expect((thrown as EngineError).code).toBe(ERROR_CODES.HOUSE_SYSTEM_UNAVAILABLE);
    });
  }
});
