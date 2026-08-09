import { z } from 'zod';
import { ProviderRef } from './provenance.ts';

/**
 * Vedic (Jyotish) domain contracts. P2 provides the precision-gated numeric
 * substrate; P3A derives deterministic rashi, whole-sign bhava, nakshatra/pada,
 * instantaneous panchanga and D1/D9 classifications from that substrate. Vaara
 * and Vimshottari remain deliberately absent behind their separate evidence gates.
 */

/**
 * Vedic settings. The Rahu convention stays OPTIONAL WITHOUT A DEFAULT because its
 * owner decision is still open (ADR 0013, Open question 1). `dashaYear` is also
 * intentionally not wired in P2: the owner-confirmed model lands with P3 dasha
 * calculations and their same-model cross-check.
 *
 * - `nodes`: mean vs true Rahu (proposed default 'mean', NOT confirmed).
 * - `dashaYear`: owner-confirmed as 'julian-365.25', but P3 remains blocked on a
 *   same-model dual-implementation cross-check. The enum is reserved here so the
 *   contract surface is stable, but no value is wired into P2.
 *
 * The owner-confirmed Vaara sunrise model has NO field until its P2 backend-mapping
 * verification is done.
 */
export const VedicSettings = z.strictObject({
  rulesetId: z.string().default('vedic-parashara-lahiri@0.1.0'),
  /** Rahu node model. No default: owner decision pending (ADR 0013 Open question 1). */
  nodes: z.enum(['mean', 'true']).optional(),
  /** Vimshottari year model. No default until P3 wires the confirmed model. */
  dashaYear: z.enum(['julian-365.25', 'savana-360', 'sidereal']).optional(),
});
export type VedicSettings = z.infer<typeof VedicSettings>;

/** Seven classical grahas with Swiss-fixture-gated sidereal longitudes. */
export const VedicGraha = z.enum(['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']);
export type VedicGraha = z.infer<typeof VedicGraha>;

/** Twelve sidereal rashis in zodiacal order, beginning at 0° Aries (Mesha). */
export const VedicRashi = z.enum([
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
]);
export type VedicRashi = z.infer<typeof VedicRashi>;

/** The 27-nakshatra scheme; Abhijit and any 28-nakshatra convention are out of scope. */
export const VedicNakshatraName = z.enum([
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
]);
export type VedicNakshatraName = z.infer<typeof VedicNakshatraName>;

export const VedicNakshatraPlacement = z.strictObject({
  /** One-based conventional nakshatra number (1=Ashwini … 27=Revati). */
  index: z.number().int().min(1).max(27),
  name: VedicNakshatraName,
  /** One-based quarter within the nakshatra. */
  pada: z.number().int().min(1).max(4),
});
export type VedicNakshatraPlacement = z.infer<typeof VedicNakshatraPlacement>;

/** The eleven names used by the 60 half-tithi karana positions. */
export const VedicKaranaName = z.enum([
  'Kimstughna',
  'Bava',
  'Balava',
  'Kaulava',
  'Taitila',
  'Garaja',
  'Vanija',
  'Vishti',
  'Shakuni',
  'Chatushpada',
  'Naga',
]);
export type VedicKaranaName = z.infer<typeof VedicKaranaName>;

/** A normalized sidereal ecliptic longitude, used by both the P2 substrate and P3A overlay. */
export const VedicLongitude = z.number().min(0).lt(360);
export type VedicLongitude = z.infer<typeof VedicLongitude>;

export const VedicGrahaPlacement = z.strictObject({
  graha: VedicGraha,
  longitudeDeg: VedicLongitude,
});
export type VedicGrahaPlacement = z.infer<typeof VedicGrahaPlacement>;

/** Ketu is derived exactly from Rahu and is never independently ephemeris-computed. */
export const VedicNodePair = z.strictObject({
  rahuLongitudeDeg: VedicLongitude,
  ketuLongitudeDeg: VedicLongitude,
});
export type VedicNodePair = z.infer<typeof VedicNodePair>;

/**
 * P3A classification for one already-canonical sidereal longitude. `bhava` is
 * a one-based whole-sign house, derived only after a real Lagna is available.
 */
export const VedicDerivedPlacement = z.strictObject({
  longitudeDeg: VedicLongitude,
  rashi: VedicRashi,
  nakshatra: VedicNakshatraPlacement,
  /** D9 rashi under the frozen Parashari mapping. */
  navamsha: VedicRashi,
  bhava: z.number().int().min(1).max(12),
});
export type VedicDerivedPlacement = z.infer<typeof VedicDerivedPlacement>;

export const VedicGrahaDerivedPlacement = VedicDerivedPlacement.extend({
  graha: VedicGraha,
}).strict();
export type VedicGrahaDerivedPlacement = z.infer<typeof VedicGrahaDerivedPlacement>;

export const VedicNodeDerivedPair = z.strictObject({
  rahu: VedicDerivedPlacement,
  ketu: VedicDerivedPlacement,
});
export type VedicNodeDerivedPair = z.infer<typeof VedicNodeDerivedPair>;

/** Instantaneous panchanga only: Vaara needs its separately gated sunrise mapping. */
export const VedicInstantaneousPanchanga = z.strictObject({
  tithi: z.strictObject({
    number: z.number().int().min(1).max(30),
    paksha: z.enum(['shukla', 'krishna']),
  }),
  yoga: z.strictObject({
    number: z.number().int().min(1).max(27),
  }),
  karana: z.strictObject({
    /** Zero-based half-tithi position, 0 through 59. */
    slot: z.number().int().min(0).max(59),
    name: VedicKaranaName,
  }),
});
export type VedicInstantaneousPanchanga = z.infer<typeof VedicInstantaneousPanchanga>;

/**
 * P3A overlay over the P2 numerical substrate. It is null when the birth time is
 * unknown: the normalizer's noon anchor is not a claimed chart instant, and P4
 * owns the finer day-stability and public-warning policy.
 */
export const VedicDerivedChart = z.strictObject({
  grahas: z.array(VedicGrahaDerivedPlacement).length(7),
  nodes: z.strictObject({
    mean: VedicNodeDerivedPair,
    true: VedicNodeDerivedPair,
  }),
  /** Lagna itself is always the first whole-sign bhava. */
  lagna: VedicDerivedPlacement,
  panchanga: VedicInstantaneousPanchanga,
});
export type VedicDerivedChart = z.infer<typeof VedicDerivedChart>;

/**
 * P2/P3A Vedic result envelope. Both node modes are emitted until the owner selects
 * a product default. Lagna and the derived overlay are null when no birth time is
 * known; the engine never treats its normalization anchor as a real birth time.
 */
export const VedicChartResult = z.strictObject({
  rulesetId: z.string(),
  provider: ProviderRef,
  ayanamsha: z.strictObject({
    id: z.literal('lahiri-iae-1985'),
    swissReferenceMode: z.literal('SE_SIDM_LAHIRI'),
  }),
  grahas: z.array(VedicGrahaPlacement).length(7),
  nodes: z.strictObject({
    mean: VedicNodePair,
    true: VedicNodePair,
  }),
  lagnaLongitudeDeg: VedicLongitude.nullable(),
  derived: VedicDerivedChart.nullable(),
  /** Granted only by the offline P2 Swiss fixture regression (≤1′ for every P2 field). */
  precision: z.literal('high'),
});
export type VedicChartResult = z.infer<typeof VedicChartResult>;
