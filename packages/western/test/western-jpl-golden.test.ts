import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NATAL_BODIES, planetPlacement } from '../src/ephemeris.ts';

/**
 * Independent golden regression against the NASA/JPL Horizons ephemeris service.
 *
 * Unlike the wrapper-consistency layer in `precision-regression.test.ts` (which compares
 * our wrapper against astronomy-engine's own output), these expectations were fetched ONCE
 * from an ephemeris pipeline that shares NO code with astronomy-engine's VSOP87 + NOVAS
 * route — so they catch a wrong provider, a broken frame (J2000 vs of-date), or a missing
 * aberration step, not just wrapper bugs. The fixture records the full query and frame
 * provenance; the test itself runs fully offline. Epochs are technical instants, not
 * anyone's birth data. Measured worst deviation at capture time: 0.20 arc-minutes
 * (Neptune) — all ten bodies pass the same ≤1 arc-minute gate as ADR 0003.
 */

const here = dirname(fileURLToPath(import.meta.url));

interface HorizonsGolden {
  toleranceArcmin: number;
  epochsUtc: string[];
  longitudesDeg: Record<(typeof NATAL_BODIES)[number], number[]>;
}

const golden = JSON.parse(
  readFileSync(join(here, '..', 'goldens', 'jpl-horizons.json'), 'utf8'),
) as HorizonsGolden;

function wrapDeltaDeg(a: number, b: number): number {
  let d = Math.abs(a - b);
  if (d > 180) d = 360 - d;
  return d;
}

describe('JPL Horizons independent golden (geocentric apparent ecliptic-of-date longitudes)', () => {
  it('fixture covers all ten natal bodies at every epoch', () => {
    expect(golden.epochsUtc.length).toBeGreaterThanOrEqual(3);
    for (const body of NATAL_BODIES) {
      expect(golden.longitudesDeg[body], body).toHaveLength(golden.epochsUtc.length);
    }
  });

  for (const body of NATAL_BODIES) {
    it(`${body} matches Horizons within ${golden.toleranceArcmin} arc-minute`, () => {
      golden.epochsUtc.forEach((iso, i) => {
        const ours = planetPlacement(body, Date.parse(iso)).longitudeDeg;
        const deltaArcmin = wrapDeltaDeg(ours, golden.longitudesDeg[body][i]!) * 60;
        expect(deltaArcmin, `${body} @ ${iso}`).toBeLessThanOrEqual(golden.toleranceArcmin);
      });
    });
  }
});
