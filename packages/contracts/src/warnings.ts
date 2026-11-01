import { z } from 'zod';

/**
 * Warnings are non-fatal signals attached to a result. Any implicit fallback
 * (house system, timezone, solar-time strategy, unknown/approximate time,
 * proximity to a discrete boundary) MUST surface here (handoff §3.3).
 */
export const WARNING_CODES = {
  /** Requested time was flagged approximate by the user. */
  TIME_ACCURACY_APPROXIMATE: 'TIME_ACCURACY_APPROXIMATE',
  /** Birth time unknown — time-of-day dependent results are suppressed. */
  TIME_UNKNOWN: 'TIME_UNKNOWN',
  /** Local time was ambiguous (DST fall-back) and resolved via user's earlier/later choice. */
  DST_AMBIGUOUS_RESOLVED: 'DST_AMBIGUOUS_RESOLVED',
  /** Apparent/mean solar time is APPLIED to a calculation and uses an approximation
   *  (documented method + precision). Emitted only when a non-civil solar mode is requested;
   *  civil/UTC runs never carry this code. */
  SOLAR_TIME_APPROXIMATE: 'SOLAR_TIME_APPROXIMATE',
  /** Western sidereal zodiac display uses the linear ayanamsha model (approximate). */
  SIDEREAL_AYANAMSHA_APPROXIMATE: 'SIDEREAL_AYANAMSHA_APPROXIMATE',
  /** Western lunar nodes are self-computed (true: osculating ~arc-minutes; mean: Meeus). */
  LUNAR_NODE_APPROXIMATE: 'LUNAR_NODE_APPROXIMATE',
  /** Western asteroids use Keplerian osculating elements (sub-degree; Chiron coarser). */
  ASTEROID_APPROXIMATE: 'ASTEROID_APPROXIMATE',
  /** A requested chart system is not implemented yet in this engine version. */
  SYSTEM_NOT_YET_IMPLEMENTED: 'SYSTEM_NOT_YET_IMPLEMENTED',
  /** Local civil datetime is within a few minutes of a solar-term / date / hour boundary. */
  NEAR_BOUNDARY: 'NEAR_BOUNDARY',
  /** High latitude may make some quadrant house systems unstable (Western). */
  HIGH_LATITUDE_HOUSE_RISK: 'HIGH_LATITUDE_HOUSE_RISK',
  /** Lunar input was converted to a Gregorian date before normalization. */
  LUNAR_CONVERTED: 'LUNAR_CONVERTED',
  /** BaZi luck cycle needs a gender rule; it was omitted so the cycle is not computed. */
  BAZI_GENDER_REQUIRED: 'BAZI_GENDER_REQUIRED',
  /** Zi Wei needs a gender rule and a known time; the chart was not computed. */
  ZIWEI_INPUT_REQUIRED: 'ZIWEI_INPUT_REQUIRED',
  /** A requested rule variant is not implemented; the provider default was applied. */
  RULESET_VARIANT_DEFAULTED: 'RULESET_VARIANT_DEFAULTED',
  /** A Vedic location has no sunrise in the bounded local search window. */
  VEDIC_SUNRISE_UNAVAILABLE: 'VEDIC_SUNRISE_UNAVAILABLE',
  /** A reserved Vimshottari year model was requested but has no implementation. */
  VEDIC_DASHA_YEAR_UNSUPPORTED: 'VEDIC_DASHA_YEAR_UNSUPPORTED',
  /** Unknown birth time prevents one or more Vedic facts from being truthfully emitted. */
  VEDIC_TIME_REQUIRED: 'VEDIC_TIME_REQUIRED',
} as const;

export type WarningCode = (typeof WARNING_CODES)[keyof typeof WARNING_CODES];

export const WarningSeverity = z.enum(['info', 'warning']);
export type WarningSeverity = z.infer<typeof WarningSeverity>;

export const EngineSystem = z.enum(['time', 'western', 'bazi', 'ziwei', 'vedic', 'engine']);
export type EngineSystem = z.infer<typeof EngineSystem>;

export const EngineWarning = z.object({
  code: z.enum(Object.values(WARNING_CODES) as [WarningCode, ...WarningCode[]]),
  severity: WarningSeverity,
  system: EngineSystem,
  message: z.string(),
  detail: z.record(z.string(), z.unknown()).optional(),
});
export type EngineWarning = z.infer<typeof EngineWarning>;

/** Convenience constructor keeping warning creation consistent across packages. */
export function makeWarning(
  code: WarningCode,
  system: EngineSystem,
  message: string,
  options?: { severity?: WarningSeverity; detail?: Record<string, unknown> },
): EngineWarning {
  const warning: EngineWarning = {
    code,
    system,
    message,
    severity: options?.severity ?? 'warning',
  };
  if (options?.detail !== undefined) warning.detail = options.detail;
  return warning;
}
