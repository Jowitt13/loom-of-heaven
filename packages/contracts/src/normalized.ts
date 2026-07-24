import { z } from 'zod';
import { CalendarSystem, GeoLocation, TimeAccuracy } from './birth-input.ts';
import { TzdbRef } from './provenance.ts';

/** How an ambiguous/unknown local time was handled. */
export const AmbiguityStatus = z.enum([
  'unambiguous',
  'ambiguous-resolved',
  'not-applicable-unknown-time',
]);
export type AmbiguityStatus = z.infer<typeof AmbiguityStatus>;

export const AmbiguityInfo = z.object({
  status: AmbiguityStatus,
  candidateCount: z.number().int().min(0),
  resolution: z.enum(['earlier', 'later']).optional(),
});
export type AmbiguityInfo = z.infer<typeof AmbiguityInfo>;

/**
 * Solar-time block. Present only when the birth time is known. Mean solar time is
 * purely longitude-driven; apparent solar time adds the equation of time. These
 * are optional inputs to BaZi/Zi Wei only — never a substitute for the Western
 * UTC instant + coordinates (handoff §3.3, §4).
 */
export const SolarTimeInfo = z.object({
  /** Wall-clock solar reading, no civil zone: "YYYY-MM-DDTHH:mm:ss". */
  meanSolarTimeIso: z.string(),
  apparentSolarTimeIso: z.string(),
  /** Longitude contribution in minutes (longitude * 4), east positive. */
  longitudeOffsetMinutes: z.number(),
  equationOfTimeMinutes: z.number(),
  method: z.string(),
});
export type SolarTimeInfo = z.infer<typeof SolarTimeInfo>;

/**
 * The single normalization result. Time is normalized exactly once and every
 * downstream provider consumes this — never the raw input (handoff §4).
 */
export const NormalizedBirthData = z.object({
  schemaVersion: z.string(),
  calendar: CalendarSystem,
  timeAccuracy: TimeAccuracy,
  /** False when the birth time is unknown; time-of-day results must be suppressed. */
  timeKnown: z.boolean(),

  /** Echo of the wall date/time actually used (unknown time is anchored to 12:00:00). */
  localDate: z.string(),
  localTime: z.string(),

  /** Local civil datetime with numeric offset: "YYYY-MM-DDTHH:mm:ss±HH:MM". */
  localCivilIso: z.string(),
  timezone: z.string(),
  /** East-positive minutes (ISO convention), e.g. +480 for UTC+8. */
  timezoneOffsetMinutes: z.number().int(),

  /** UTC instant as ISO-Z string and as epoch milliseconds (a number, never a Date). */
  utcInstant: z.string(),
  utcInstantMs: z.number().int(),

  ambiguity: AmbiguityInfo,
  location: GeoLocation,
  solar: SolarTimeInfo.nullable(),
  tzdb: TzdbRef,
});
export type NormalizedBirthData = z.infer<typeof NormalizedBirthData>;
