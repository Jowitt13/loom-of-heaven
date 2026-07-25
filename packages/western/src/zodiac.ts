import type { WesternSign } from '@ming/contracts';
import { norm360 } from './ephemeris.ts';

/**
 * Tropical zodiac classification and essential-dignity table. The dignity scheme is
 * the standard modern one (outer-planet rulerships: Pluto→Scorpio, Neptune→Pisces,
 * Uranus→Aquarius; classical dual rulerships kept for Mars/Jupiter/Saturn), sourced
 * from mainstream tropical-astrology references and carried, versioned, by the active
 * ruleset (western-tropical-placidus). It is a deterministic lookup, not a verdict.
 */

/** The twelve tropical signs in zodiacal order. */
export const SIGNS: readonly WesternSign[] = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
];

/** Map an ecliptic longitude to its sign and degrees-within-sign. */
export function signFromLongitude(longitudeDeg: number): { sign: WesternSign; signDeg: number } {
  const norm = norm360(longitudeDeg);
  const index = Math.floor(norm / 30) % 12;
  return { sign: SIGNS[index]!, signDeg: norm - index * 30 };
}

const MS_PER_DAY = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

/**
 * Ayanamsha (岁差): the tropical→sidereal offset. Lahiri (Chitrapaksha) is the
 * Indian-government standard, ≈23.85° at J2000 growing ~50.29″/yr; Fagan-Bradley is
 * the common Western-sidereal value (≈24.74° at J2000). Linear model over the
 * 1901–2100 window — exact enough for sign placement.
 */
export function ayanamshaDegrees(model: 'lahiri' | 'fagan-bradley', dateMs: number): number {
  const years = (dateMs - J2000_MS) / MS_PER_DAY / 365.25;
  const perYear = 50.2909 / 3600; // degrees per year
  const atJ2000 = model === 'fagan-bradley' ? 24.7419 : 23.8523;
  return atJ2000 + perYear * years;
}

/** Convert a tropical ecliptic longitude to sidereal by subtracting the ayanamsha. */
export function toSidereal(
  tropicalLongitudeDeg: number,
  model: 'lahiri' | 'fagan-bradley',
  dateMs: number,
): number {
  return norm360(tropicalLongitudeDeg - ayanamshaDegrees(model, dateMs));
}

function oppositeSign(sign: WesternSign): WesternSign {
  return SIGNS[(SIGNS.indexOf(sign) + 6) % 12]!;
}

/** Domicile (rulership) signs per point (modern; dual rulerships included). */
const DOMICILE: Record<string, WesternSign[]> = {
  Sun: ['Leo'],
  Moon: ['Cancer'],
  Mercury: ['Gemini', 'Virgo'],
  Venus: ['Taurus', 'Libra'],
  Mars: ['Aries', 'Scorpio'],
  Jupiter: ['Sagittarius', 'Pisces'],
  Saturn: ['Capricorn', 'Aquarius'],
  Uranus: ['Aquarius'],
  Neptune: ['Pisces'],
  Pluto: ['Scorpio'],
};

/** Exaltation sign per point (traditional). */
const EXALTATION: Record<string, WesternSign> = {
  Sun: 'Aries',
  Moon: 'Taurus',
  Mercury: 'Virgo',
  Venus: 'Pisces',
  Mars: 'Capricorn',
  Jupiter: 'Cancer',
  Saturn: 'Libra',
};

/**
 * Essential dignity of a point in a sign: 'domicile' | 'exaltation' | 'detriment' |
 * 'fall', or undefined when peregrine (none of the four). Detriment is opposite the
 * domicile, fall is opposite the exaltation. Points without a tabled dignity (e.g.
 * the lunar nodes) return undefined.
 */
export function dignityOf(body: string, sign: WesternSign): string | undefined {
  const domicile = DOMICILE[body];
  if (domicile?.includes(sign)) return 'domicile';
  if (domicile?.includes(oppositeSign(sign))) return 'detriment';
  const exaltation = EXALTATION[body];
  if (exaltation === sign) return 'exaltation';
  if (exaltation !== undefined && oppositeSign(exaltation) === sign) return 'fall';
  return undefined;
}
