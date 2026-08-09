import { z } from 'zod';
import { ProviderRef } from './provenance.ts';

/**
 * Vedic (Jyotish) domain contracts. P2 provides only the precision-gated numeric
 * substrate: seven graha longitudes, both node modes and (when a time is known)
 * Lagna. Nakshatra, panchanga, bhava, vargas and dashas remain P3 work.
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

/** P2's seven classical grahas with Swiss-fixture-gated sidereal longitudes. */
export const VedicGraha = z.enum(['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']);
export type VedicGraha = z.infer<typeof VedicGraha>;

/** A normalized sidereal ecliptic longitude. P2 emits no derived classification. */
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
 * Vedic P2 numeric result envelope. Both node modes are emitted until the owner
 * selects a product default. Lagna is null when no birth time is known; the engine
 * never treats its normalization anchor as a real birth time.
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
  /** Granted only by the offline P2 Swiss fixture regression (≤1′ for every P2 field). */
  precision: z.literal('high'),
});
export type VedicChartResult = z.infer<typeof VedicChartResult>;
