import type { VedicRashi } from '@ming/contracts';
import { canonicalLongitude } from './math.ts';

/** Twelve sidereal rashis in fixed zodiacal order. */
export const RASHIS: readonly VedicRashi[] = [
  'Mesha',
  'Vrishabha',
  'Mithuna',
  'Karka',
  'Simha',
  'Kanya',
  'Tula',
  'Vrishchika',
  'Dhanu',
  'Makara',
  'Kumbha',
  'Meena',
];

/** Zero-based rashi index for a canonical sidereal longitude. */
export function rashiIndexOf(longitudeDeg: number): number {
  return Math.floor(canonicalLongitude(longitudeDeg) / 30);
}

/** Rashi for a canonical sidereal longitude. */
export function rashiOf(longitudeDeg: number): VedicRashi {
  return RASHIS[rashiIndexOf(longitudeDeg)]!;
}
