import { z } from 'zod';
import { ProviderRef } from './provenance.ts';

/**
 * Vedic (Jyotish) domain contracts — P1 skeleton (ADR 0013, Status: Proposed).
 *
 * IMPORTANT: no Vedic calculation exists yet. The provider (`@ming/vedic`) returns
 * null + SYSTEM_NOT_YET_IMPLEMENTED for every request; graha placements, Lagna,
 * nakshatra, panchanga, vargas and dashas land in P2/P3 behind their own goldens.
 * Nothing in this file may be read as a shipped capability.
 */

/**
 * Vedic settings. Two conventions are deliberately OPTIONAL WITHOUT DEFAULTS —
 * they are unresolved owner decisions (ADR 0013 "Open questions" 1 and 2) and no
 * layer (schema, docs, runtime) may quietly harden a value before those land:
 *
 * - `nodes`: mean vs true Rahu (proposed default 'mean', NOT confirmed).
 * - `dashaYear`: the Vimshottari year model. Candidate 'julian-365.25'; the P3
 *   dasha implementation is BLOCKED on the owner decision plus a same-model
 *   dual-implementation cross-check. The enum is reserved here so the contract
 *   surface is stable, but no value is wired anywhere.
 *
 * The sunrise model for Vaara (ADR 0013 §9) is likewise undecided and therefore
 * has NO field at all until its P2 backend-mapping verification is done.
 */
export const VedicSettings = z.strictObject({
  rulesetId: z.string().default('vedic-parashara-lahiri@0.1.0'),
  /** Rahu node model. No default: owner decision pending (ADR 0013 Open question 1). */
  nodes: z.enum(['mean', 'true']).optional(),
  /** Vimshottari year model. No default: BLOCKED owner decision (ADR 0013 Open question 2). */
  dashaYear: z.enum(['julian-365.25', 'savana-360', 'sidereal']).optional(),
});
export type VedicSettings = z.infer<typeof VedicSettings>;

/**
 * Vedic chart result envelope. P1 ships ZERO instances of this schema — the
 * provider always returns null. It exists so ChartBundle has a typed slot and the
 * P2/P3 slices can extend it (grahas, Lagna, bhavas, nakshatra, panchanga, D1/D9,
 * Vimshottari) without another bundle-shape change.
 */
export const VedicChartResult = z.object({
  rulesetId: z.string(),
  provider: ProviderRef,
});
export type VedicChartResult = z.infer<typeof VedicChartResult>;
