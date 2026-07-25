import { describe, expect, it } from 'vitest';
import { Ecliptic, GeoVector, type Body } from 'astronomy-engine';
import { NATAL_BODIES, planetPlacement } from '../src/ephemeris.ts';

/**
 * ADR 0003 precision gate for the Western provider.
 *
 * The Western provider is built on `astronomy-engine` (VSOP87 + NOVAS, MIT) — the
 * ADR-designated ephemeris base that PASSES the ≤1 arc-minute gate. (`celestine`
 * 0.2.1 was evaluated and REJECTED at this gate: it deviated by up to ~17′ for
 * Mercury and ~37′ for Pluto against the same astronomy-engine cross-check.)
 *
 * Two layers of assurance:
 *  1. Self-consistency: our ephemeris wrapper reproduces the astronomy-engine reference
 *     longitude to ≤1 arc-minute for ALL ten bodies (incl. Mercury and Pluto),
 *     guarding against wrapper bugs or an inaccurate provider swap.
 *  2. Independent golden anchors: the Sun's tropical longitude at the four
 *     cardinal points (equinoxes/solstices) is astronomically 0/90/180/270° by
 *     definition, so these check the whole tropical pipeline (incl. the equinox
 *     reference frame) against a source that is NOT the same ephemeris.
 */

const DATES_UTC = [
  Date.UTC(1990, 2, 10, 0, 15, 0),
  Date.UTC(2000, 0, 1, 12, 0, 0),
  Date.UTC(2010, 5, 21, 18, 45, 0),
  Date.UTC(2024, 9, 3, 6, 30, 0),
  Date.UTC(1955, 3, 18, 22, 10, 0),
];

function wrapDeltaDeg(a: number, b: number): number {
  let d = Math.abs(a - b);
  if (d > 180) d = 360 - d;
  return d;
}

/** Worst-case |Δ longitude| between our wrapper and the astronomy-engine reference, in arc-minutes. */
function maxDeviationArcmin(body: (typeof NATAL_BODIES)[number]): number {
  let worst = 0;
  for (const ms of DATES_UTC) {
    const ours = planetPlacement(body, ms).longitudeDeg;
    const ref = Ecliptic(GeoVector(body as Body, new Date(ms), true)).elon;
    worst = Math.max(worst, wrapDeltaDeg(ours, ref) * 60);
  }
  return worst;
}

describe('Western ephemeris precision (ADR 0003 gate — astronomy-engine base)', () => {
  it('all ten bodies reproduce the astronomy-engine reference within 1 arc-minute', () => {
    for (const body of NATAL_BODIES) {
      expect(maxDeviationArcmin(body), body).toBeLessThanOrEqual(1);
    }
  });

  // These two were the bodies that FAILED under celestine (~17′ and ~37′). They now
  // pass because the base is the astronomy-engine reference itself.
  it('Mercury meets the ≤1 arc-min gate (failed ~17′ under celestine)', () => {
    expect(maxDeviationArcmin('Mercury')).toBeLessThanOrEqual(1);
  });

  it('Pluto meets the ≤1 arc-min gate (failed ~37′ under celestine)', () => {
    expect(maxDeviationArcmin('Pluto')).toBeLessThanOrEqual(1);
  });
});

describe('Sun golden anchors at the cardinal points (independent of the ephemeris)', () => {
  // Documented instants (UTC) when the Sun's apparent tropical longitude is, by
  // definition, exactly 0/90/180/270°. Tolerance 0.05° (3′) absorbs instant rounding.
  const CARDINALS: Array<{ name: string; ms: number; expectedLon: number }> = [
    { name: 'March equinox 2000', ms: Date.UTC(2000, 2, 20, 7, 35), expectedLon: 0 },
    { name: 'June solstice 2000', ms: Date.UTC(2000, 5, 21, 1, 48), expectedLon: 90 },
    { name: 'September equinox 2000', ms: Date.UTC(2000, 8, 22, 17, 27), expectedLon: 180 },
    { name: 'December solstice 2000', ms: Date.UTC(2000, 11, 21, 13, 37), expectedLon: 270 },
  ];

  for (const { name, ms, expectedLon } of CARDINALS) {
    it(`Sun at ~${expectedLon}° on the ${name}`, () => {
      const lon = planetPlacement('Sun', ms).longitudeDeg;
      expect(wrapDeltaDeg(lon, expectedLon)).toBeLessThanOrEqual(0.05);
    });
  }
});
