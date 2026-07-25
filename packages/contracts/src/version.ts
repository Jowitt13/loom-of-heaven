/**
 * Central version constants. Every emitted ChartBundle records these so results
 * are reproducible and auditable across engine upgrades.
 */

/** Public JSON contract version (BirthInput / NormalizedBirthData / ChartBundle). */
export const SCHEMA_VERSION = '0.1.0';

/**
 * Deterministic calculation engine version. Bumped to 0.1.1 for the v0.1.2 candidate:
 * the chart MATH is byte-identical to 0.1.0, but the Western provenance `source` label was
 * corrected to the accurate "astronomy-engine/VSOP87+NOVAS" attribution, which changes emitted
 * provenance text (not any numeric result), hence a new engine version.
 */
export const ENGINE_VERSION = '0.1.1';

/** Human-facing engine name. */
export const ENGINE_NAME = 'ming-engine';

/**
 * First unified support window for all three systems (handoff §1.1).
 * A single provider may later widen this only after independent verification.
 */
export const SUPPORTED_YEAR_MIN = 1901;
export const SUPPORTED_YEAR_MAX = 2100;

/** Identifier for the equation-of-time approximation used for apparent solar time. */
export const SOLAR_TIME_METHOD = 'noaa-eot@0.1.0';
