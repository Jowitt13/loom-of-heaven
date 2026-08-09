import type { VedicRashi } from '@ming/contracts';
import { canonicalLongitude } from './math.ts';
import { RASHIS, rashiIndexOf } from './rashi.ts';

const DEGREES_PER_NAVAMSHA = 30 / 9;

/**
 * D9 per the frozen Parashari rule: movable signs begin from themselves, fixed
 * from their ninth, and dual signs from their fifth. The triplicity formulation
 * below is intentionally retained as an independent implementation for tests.
 */
export function navamshaRashiIndexByModality(longitudeDeg: number): number {
  const longitude = canonicalLongitude(longitudeDeg);
  const rashiIndex = rashiIndexOf(longitude);
  const division = Math.floor((longitude - rashiIndex * 30) / DEGREES_PER_NAVAMSHA);
  const modality = rashiIndex % 3;
  const start =
    modality === 0 ? rashiIndex : modality === 1 ? (rashiIndex + 8) % 12 : (rashiIndex + 4) % 12;
  return (start + division) % 12;
}

/** Equivalent D9 formulation: fire/earth/air/water begin Aries/Capricorn/Libra/Cancer. */
export function navamshaRashiIndexByTriplicity(longitudeDeg: number): number {
  const longitude = canonicalLongitude(longitudeDeg);
  const rashiIndex = rashiIndexOf(longitude);
  const division = Math.floor((longitude - rashiIndex * 30) / DEGREES_PER_NAVAMSHA);
  const triplicityStart = [0, 9, 6, 3][rashiIndex % 4]!;
  return (triplicityStart + division) % 12;
}

/** D9 rashi using the primary modality formulation. */
export function navamshaOf(longitudeDeg: number): VedicRashi {
  return RASHIS[navamshaRashiIndexByModality(longitudeDeg)]!;
}
