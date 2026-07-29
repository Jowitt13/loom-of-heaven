import { z } from 'zod';
import { BirthInput } from './birth-input.ts';
import { EngineWarning } from './warnings.ts';
import { Provenance } from './provenance.ts';
import { BaziChartResult } from './bazi.ts';
import { ZiweiChartResult } from './ziwei.ts';
import { WesternChartResult } from './western.ts';
import { VedicChartResult } from './vedic.ts';

/**
 * Per-system result envelopes. Each system keeps its own schema rather than being
 * flattened into one abstraction (handoff §6). BaZi, Zi Wei and Western have real
 * schemas (./bazi.ts, ./ziwei.ts, ./western.ts).
 */

/**
 * Public normalized-time subset embedded in the bundle (handoff §6). This is the
 * projection consumers read; the full detail lives in NormalizedBirthData.
 */
export const NormalizedTimePublic = z.object({
  localCivil: z.string(),
  timezone: z.string(),
  utcInstant: z.string(),
  meanSolarTime: z.string().optional(),
  apparentSolarTime: z.string().optional(),
  timezoneDataVersion: z.string().optional(),
  ambiguityResolution: z.string().optional(),
});
export type NormalizedTimePublic = z.infer<typeof NormalizedTimePublic>;

/**
 * The unified result. Metadata, errors, versions and call style are unified;
 * each system keeps a distinct domain schema (handoff §6).
 */
export const ChartBundle = z.object({
  schemaVersion: z.string(),
  engineVersion: z.string(),
  requestId: z.string(),
  calculatedAt: z.string(),
  originalInput: BirthInput,
  normalizedTime: NormalizedTimePublic,
  western: WesternChartResult.optional(),
  bazi: BaziChartResult.optional(),
  ziwei: ZiweiChartResult.optional(),
  /** Reserved slot (ADR 0013 P1): never populated until the Vedic provider computes for real. */
  vedic: VedicChartResult.optional(),
  warnings: z.array(EngineWarning),
  provenance: Provenance,
});
export type ChartBundle = z.infer<typeof ChartBundle>;

/** Success envelope written to stdout by the CLI. */
export const ChartBundleEnvelope = z.object({
  ok: z.literal(true),
  bundle: ChartBundle,
});
export type ChartBundleEnvelope = z.infer<typeof ChartBundleEnvelope>;
