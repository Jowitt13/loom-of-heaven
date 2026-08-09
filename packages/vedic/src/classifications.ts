import type { VedicDerivedChart, VedicDerivedPlacement, VedicGraha } from '@ming/contracts';
import { wholeSignBhavaOf } from './bhava.ts';
import { nakshatraOf } from './nakshatra.ts';
import { instantaneousPanchanga } from './panchanga.ts';
import { rashiOf } from './rashi.ts';
import { navamshaOf } from './varga.ts';
import type { VedicP2Positions } from './vedic-provider.ts';

const GRAHAS: readonly VedicGraha[] = [
  'Sun',
  'Moon',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
];

function classifyPlacement(longitudeDeg: number, lagnaLongitudeDeg: number): VedicDerivedPlacement {
  return {
    longitudeDeg,
    rashi: rashiOf(longitudeDeg),
    nakshatra: nakshatraOf(longitudeDeg),
    navamsha: navamshaOf(longitudeDeg),
    bhava: wholeSignBhavaOf(longitudeDeg, lagnaLongitudeDeg),
  };
}

/**
 * Deterministic P3A overlay. Call only for a known birth time; its caller owns
 * suppression for the normalizer's unknown-time anchor.
 */
export function deriveVedicClassifications(positions: VedicP2Positions): VedicDerivedChart {
  const lagna = classifyPlacement(positions.lagnaLongitudeDeg, positions.lagnaLongitudeDeg);
  return {
    grahas: GRAHAS.map((graha) => ({
      graha,
      ...classifyPlacement(positions.grahas[graha], positions.lagnaLongitudeDeg),
    })),
    nodes: {
      mean: {
        rahu: classifyPlacement(positions.meanRahuLongitudeDeg, positions.lagnaLongitudeDeg),
        ketu: classifyPlacement(positions.meanKetuLongitudeDeg, positions.lagnaLongitudeDeg),
      },
      true: {
        rahu: classifyPlacement(positions.trueRahuLongitudeDeg, positions.lagnaLongitudeDeg),
        ketu: classifyPlacement(positions.trueKetuLongitudeDeg, positions.lagnaLongitudeDeg),
      },
    },
    lagna,
    panchanga: instantaneousPanchanga(positions.grahas.Sun, positions.grahas.Moon),
  };
}
