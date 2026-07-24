import { z } from 'zod';
import { ProviderRef } from './provenance.ts';

/**
 * Western natal chart domain schema (handoff §5.1, §6). Distinct from BaZi/Zi Wei.
 * Positions are tropical ecliptic longitudes computed from the UTC instant and
 * WGS84 coordinates — never true solar time (that is a BaZi/Zi Wei-only input).
 * The provider (astronomy-engine) types never leak past this contract.
 */

/** The twelve tropical zodiac signs in order. */
export const WesternSign = z.enum([
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
]);
export type WesternSign = z.infer<typeof WesternSign>;

/** A planet or computed point placed in the chart. */
export const WesternPlanet = z.object({
  /** Canonical point id: 'Sun','Moon',...,'Pluto','NorthNode','SouthNode'. */
  body: z.string(),
  /** Tropical ecliptic longitude, degrees in [0, 360). */
  longitudeDeg: z.number(),
  /** Ecliptic latitude, degrees. */
  latitudeDeg: z.number(),
  /** Signed apparent motion in ecliptic longitude, degrees per day. */
  speedDegPerDay: z.number(),
  /** True when moving backward in longitude (speedDegPerDay < 0). */
  retrograde: z.boolean(),
  sign: WesternSign,
  /** Degrees within the sign, in [0, 30). */
  signDeg: z.number(),
  /** Which house (1-12) the point falls in; null when the birth time is unknown. */
  house: z.number().int().min(1).max(12).nullable(),
  /**
   * Essential dignity classification (e.g. 'domicile', 'exaltation', 'detriment',
   * 'fall'); sourced by the active ruleset's dignity table.
   */
  dignity: z.string().optional(),
  /**
   * Position precision tier: 'high' = Astronomy Engine main-planet implementation
   * (Sun–Pluto, ≤1′ wrapper-consistency gate vs astronomy-engine's own output);
   * 'approximate' = self-computed osculating/element-based (true node, asteroids),
   * good to roughly arc-minutes and NOT part of the ≤1′ regression.
   */
  precision: z.enum(['high', 'approximate']).default('high'),
  /** Ephemeris source note, e.g. 'astronomy-engine/VSOP87+NOVAS' or 'osculating-elements'. */
  source: z.string().optional(),
});
export type WesternPlanet = z.infer<typeof WesternPlanet>;

/** One house cusp (1-12). */
export const WesternHouse = z.object({
  index: z.number().int().min(1).max(12),
  /** Tropical ecliptic longitude of the cusp, degrees in [0, 360). */
  cuspLongitudeDeg: z.number(),
  sign: WesternSign,
});
export type WesternHouse = z.infer<typeof WesternHouse>;

export const WesternAspectType = z.enum([
  'conjunction',
  'opposition',
  'trine',
  'square',
  'sextile',
]);
export type WesternAspectType = z.infer<typeof WesternAspectType>;

/** A major aspect between two points, with the actual orb from exactness. */
export const WesternAspect = z.object({
  bodyA: z.string(),
  bodyB: z.string(),
  type: WesternAspectType,
  /** Angular separation from exact aspect, degrees. */
  orbDeg: z.number(),
  /** True when the faster point is moving toward exactness. */
  applying: z.boolean().optional(),
});
export type WesternAspect = z.infer<typeof WesternAspect>;

/** A chart angle (ascendant / midheaven / descendant / imum coeli). */
export const WesternAngle = z.object({
  longitudeDeg: z.number(),
  sign: WesternSign,
});
export type WesternAngle = z.infer<typeof WesternAngle>;

export const WesternChartResult = z.object({
  rulesetId: z.string(),
  provider: ProviderRef,
  zodiac: z.enum(['tropical', 'sidereal']),
  /** Ayanamsha model + degrees applied when zodiac = 'sidereal' (null for tropical). */
  ayanamsha: z.string().nullable(),
  ayanamshaDegrees: z.number().nullable(),
  houseSystem: z.string(),
  nodes: z.enum(['true', 'mean']),
  planets: z.array(WesternPlanet),
  /** Twelve house cusps, index 1..12; empty when the birth time is unknown. */
  houses: z.array(WesternHouse),
  /** Null when the birth time is unknown (no ascendant/houses are fabricated). */
  angles: z
    .object({
      ascendant: WesternAngle,
      mc: WesternAngle,
      descendant: WesternAngle,
      ic: WesternAngle,
    })
    .nullable(),
  aspects: z.array(WesternAspect),
});
export type WesternChartResult = z.infer<typeof WesternChartResult>;
