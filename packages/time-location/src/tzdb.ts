import moment from 'moment-timezone';
import type { TzdbRef } from '@ming/contracts';

/**
 * Single choke point for the bundled, version-pinned IANA time-zone database.
 *
 * We deliberately use moment-timezone (MIT) because it ships its own packed tz
 * data with a recorded release id (`moment.tz.dataVersion`, e.g. "2026c"). This
 * keeps results identical on Node and in a browser regardless of the host's ICU
 * data (handoff §4 / Phase 0 TZDB requirement) — unlike Intl-backed libraries.
 *
 * moment-timezone's `zone.utcOffset(ts)` uses the west-positive convention (like
 * Date.prototype.getTimezoneOffset): +240 for UTC-4, -480 for UTC+8.
 */

/** IANA data release currently bundled (dynamic — never hardcoded). */
export function tzdbVersion(): string {
  return moment.tz.dataVersion;
}

/** Underlying moment engine version (for provenance/doctor). */
export function momentVersion(): string {
  return moment.version;
}

export function tzdbRef(): TzdbRef {
  return { source: 'moment-timezone', version: moment.tz.dataVersion };
}

/** True when `name` is a known IANA zone id in the bundled data. */
export function zoneExists(name: string): boolean {
  return moment.tz.zone(name) !== null;
}

/** Number of zones in the bundled data (doctor diagnostics). */
export function zoneCount(): number {
  return moment.tz.names().length;
}

/**
 * West-positive UTC offset (minutes) for a zone at a true UTC instant.
 * Throws if the zone is unknown — callers validate existence first.
 */
export function zoneOffsetWestMin(name: string, utcMs: number): number {
  const zone = moment.tz.zone(name);
  if (zone === null) throw new Error(`Unknown IANA time zone: ${name}`);
  return zone.utcOffset(utcMs);
}
