/**
 * Central version constants. Every emitted ChartBundle records these so results
 * are reproducible and auditable across engine upgrades.
 */

/** Public JSON contract version (BirthInput / NormalizedBirthData / ChartBundle). */
export const SCHEMA_VERSION = '0.1.0';

/**
 * Deterministic calculation engine version. v0.4.0 records the owner-confirmed mean-Rahu
 * product default and the new four-system default calculation scope. It changes normalized
 * input, deterministic request ids, and provenance; consumers must record this version alongside
 * every result.
 */
export const ENGINE_VERSION = '0.4.0';

/** Human-facing engine name. */
export const ENGINE_NAME = 'loom-of-heaven';

/**
 * Unified support window for all four systems (handoff §1.1).
 * A single provider may later widen this only after independent verification.
 */
export const SUPPORTED_YEAR_MIN = 1901;
export const SUPPORTED_YEAR_MAX = 2100;

/** Identifier for the equation-of-time approximation used for apparent solar time. */
export const SOLAR_TIME_METHOD = 'noaa-eot@0.1.0';
