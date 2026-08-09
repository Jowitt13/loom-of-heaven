import { z } from 'zod';
import { ProviderRef } from './provenance.ts';

/**
 * Vedic (Jyotish) domain contracts. P2 provides the precision-gated numeric
 * substrate; P3 derives deterministic rashi, whole-sign bhava, nakshatra/pada,
 * panchanga/Vaara, D1/D9 and Vimshottari classifications from that substrate.
 * Vaara/Vimshottari are nullable only where an input cannot support a truthful
 * value (unknown time, polar no-sunrise, or a reserved future dasha model).
 */

/**
 * Vedic settings. The Rahu convention stays OPTIONAL WITHOUT A DEFAULT because its
 * owner decision is still open (ADR 0013, Open question 1). The P3B
 * Vimshottari model is owner-confirmed and independently cross-checked.
 *
 * - `nodes`: mean vs true Rahu (proposed default 'mean', NOT confirmed).
 * - `dashaYear`: `julian-365.25` is the owner-confirmed P3B default. Alternate
 *   reserved values are rejected explicitly until a future ruleset implements them.
 *
 * Vaara has no settings switch in v1: its verified model is upper limb + standard
 * refraction at sea level (ADR 0013 §9).
 */
export const VedicSettings = z.strictObject({
  rulesetId: z.string().default('vedic-parashara-lahiri@0.1.0'),
  /** Rahu node model. No default: owner decision pending (ADR 0013 Open question 1). */
  nodes: z.enum(['mean', 'true']).optional(),
  /** Owner-confirmed P3B default; future models require new ruleset versions. */
  dashaYear: z.enum(['julian-365.25', 'savana-360', 'sidereal']).default('julian-365.25'),
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

/** The instantaneous Panchanga members; P3B adds Vaara in VedicPanchanga below. */
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
 * The only time-unknown Vedic values that may cross the fact boundary. Each
 * member is present only when it remains unchanged throughout the subject's
 * local civil day; time-of-day outputs (Lagna, bhava, D9, Vaara and dasha
 * endpoints) are never inferred from the normalizer's noon anchor.
 */
export const VedicUnknownTimeStable = z.strictObject({
  moonNakshatra: VedicNakshatraPlacement.nullable(),
  panchanga: VedicInstantaneousPanchanga.nullable(),
});
export type VedicUnknownTimeStable = z.infer<typeof VedicUnknownTimeStable>;

/** Traditional weekday names in the Sunday-to-Saturday order. */
export const VedicVaara = z.enum([
  'Ravivara',
  'Somavara',
  'Mangalavara',
  'Budhavara',
  'Guruvara',
  'Shukravara',
  'Shanivara',
]);
export type VedicVaara = z.infer<typeof VedicVaara>;

/** P3B panchanga: instantaneous members plus the verified local-sunrise Vaara. */
export const VedicPanchanga = VedicInstantaneousPanchanga.extend({
  /** Null only when the location has no nearby sunrise (never silently assigned). */
  vaara: VedicVaara.nullable(),
}).strict();
export type VedicPanchanga = z.infer<typeof VedicPanchanga>;

export const VedicDashaLord = z.enum([
  'Ketu',
  'Venus',
  'Sun',
  'Moon',
  'Mars',
  'Rahu',
  'Jupiter',
  'Saturn',
  'Mercury',
]);
export type VedicDashaLord = z.infer<typeof VedicDashaLord>;

export const VedicDashaAntarPeriod = z.strictObject({
  lord: VedicDashaLord,
  startUtc: z.string(),
  endUtc: z.string(),
});
export type VedicDashaAntarPeriod = z.infer<typeof VedicDashaAntarPeriod>;

/** Full Maha period; children partition its exact half-open interval. */
export const VedicDashaMahaPeriod = VedicDashaAntarPeriod.extend({
  antar: z.array(VedicDashaAntarPeriod).length(9),
}).strict();
export type VedicDashaMahaPeriod = z.infer<typeof VedicDashaMahaPeriod>;

/** Owner-confirmed, independently cross-checked P3B Vimshottari output. */
export const VedicVimshottari = z.strictObject({
  dashaYear: z.literal('julian-365.25'),
  birthMoonLongitudeDeg: VedicLongitude,
  birthNakshatraIndex: z.number().int().min(1).max(27),
  nakshatraProgressFraction: z.number().min(0).lt(1),
  mahadashas: z.array(VedicDashaMahaPeriod).length(9),
});
export type VedicVimshottari = z.infer<typeof VedicVimshottari>;

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
  panchanga: VedicPanchanga,
  /** Null when a future reserved dasha model was explicitly requested. */
  vimshottari: VedicVimshottari.nullable(),
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
  /** P4's whole-local-day stability projection for a time-unknown input. */
  unknownTimeStable: VedicUnknownTimeStable.nullable(),
  /** Granted only by the offline P2 Swiss fixture regression (≤1′ for every P2 field). */
  precision: z.literal('high'),
});
export type VedicChartResult = z.infer<typeof VedicChartResult>;
