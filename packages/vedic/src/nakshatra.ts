import type { VedicNakshatraPlacement } from '@ming/contracts';
import { canonicalLongitude } from './math.ts';

const DEGREES_PER_NAKSHATRA = 360 / 27;
const DEGREES_PER_PADA = DEGREES_PER_NAKSHATRA / 4;

/** The frozen 27-nakshatra scheme, beginning at sidereal 0° Aries. */
export const NAKSHATRAS: readonly VedicNakshatraPlacement['name'][] = [
  'Ashwini',
  'Bharani',
  'Krittika',
  'Rohini',
  'Mrigashira',
  'Ardra',
  'Punarvasu',
  'Pushya',
  'Ashlesha',
  'Magha',
  'PurvaPhalguni',
  'UttaraPhalguni',
  'Hasta',
  'Chitra',
  'Swati',
  'Vishakha',
  'Anuradha',
  'Jyeshtha',
  'Mula',
  'PurvaAshadha',
  'UttaraAshadha',
  'Shravana',
  'Dhanishtha',
  'Shatabhisha',
  'PurvaBhadrapada',
  'UttaraBhadrapada',
  'Revati',
];

/** One-based nakshatra and pada for a canonical sidereal longitude. */
export function nakshatraOf(longitudeDeg: number): VedicNakshatraPlacement {
  const longitude = canonicalLongitude(longitudeDeg);
  const indexZero = Math.floor(longitude / DEGREES_PER_NAKSHATRA);
  const offset = longitude - indexZero * DEGREES_PER_NAKSHATRA;
  return {
    index: indexZero + 1,
    name: NAKSHATRAS[indexZero]!,
    pada: Math.floor(offset / DEGREES_PER_PADA) + 1,
  };
}
