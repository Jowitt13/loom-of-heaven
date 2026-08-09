import { z } from 'zod';
import { SCHEMA_VERSION } from './version.ts';
import { VedicSettings } from './vedic.ts';

/** YYYY-MM-DD (calendar-agnostic wall date). */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** HH:mm or HH:mm:ss (24h wall clock). */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export const CalendarSystem = z.enum(['gregorian', 'lunar']);
export type CalendarSystem = z.infer<typeof CalendarSystem>;

export const TimeAccuracy = z.enum(['exact', 'approximate', 'unknown']);
export type TimeAccuracy = z.infer<typeof TimeAccuracy>;

/**
 * Chart systems. Vedic became a first-class calculated system in v0.3.0. The
 * v0.4.0 product default requests all four systems; callers may still select
 * an explicit subset when that is the intended scope.
 */
export const ChartSystem = z.enum(['western', 'bazi', 'ziwei', 'vedic']);
export type ChartSystem = z.infer<typeof ChartSystem>;

/** DST fall-back disambiguation: which of two identical wall clocks to keep. */
export const FoldChoice = z.enum(['earlier', 'later']);
export type FoldChoice = z.infer<typeof FoldChoice>;

export const GeoLocation = z.strictObject({
  displayName: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  elevationMeters: z.number().min(-500).max(9000).optional(),
  /** Where the coordinates came from; geocoder use requires separate consent. */
  source: z.enum(['user', 'geocoder', 'import']),
});
export type GeoLocation = z.infer<typeof GeoLocation>;

/** Western defaults: tropical zodiac, Placidus houses, true node (handoff §5.1). */
export const WESTERN_RULESET_CURRENT = 'western-tropical-placidus@0.2.0';
/** Retired ruleset ids that are no longer computed (returns RULESET_UNSUPPORTED). */
export const WESTERN_RULESET_RETIRED = ['western-tropical-placidus@0.1.0'] as const;
export const WesternSettings = z.strictObject({
  rulesetId: z.string().default(WESTERN_RULESET_CURRENT),
  zodiac: z.enum(['tropical', 'sidereal']).default('tropical'),
  /** Sidereal ayanamsha model; only applied when zodiac = 'sidereal'. */
  ayanamsha: z.enum(['lahiri', 'fagan-bradley']).default('lahiri'),
  houseSystem: z.enum(['placidus', 'whole-sign', 'equal', 'koch', 'porphyry']).default('placidus'),
  nodes: z.enum(['true', 'mean']).default('true'),
  /** Include the five asteroids (Chiron/Ceres/Pallas/Juno/Vesta); approximate precision. */
  asteroids: z.boolean().default(true),
});
export type WesternSettings = z.infer<typeof WesternSettings>;

/** BaZi disputed points are versioned, not scattered booleans (handoff §5.2). */
export const BaziSettings = z.strictObject({
  rulesetId: z.string().default('bazi-standard@0.1.0'),
  /** Which time base feeds the pillars. Solar-time modes only apply here, never to Western. */
  solarTimeMode: z.enum(['civil', 'mean', 'apparent']).default('civil'),
  dayBoundary: z.enum(['midnight', 'zi-hour']).default('zi-hour'),
  earlyLateZi: z.enum(['early', 'late']).default('late'),
});
export type BaziSettings = z.infer<typeof BaziSettings>;

/** Zi Wei defaults follow a named iztro ruleset (handoff §5.3). */
export const ZiweiSettings = z.strictObject({
  rulesetId: z.string().default('iztro-default@0.1.0'),
  useApparentSolarTime: z.boolean().default(false),
});
export type ZiweiSettings = z.infer<typeof ZiweiSettings>;

export const CalculationSettings = z.strictObject({
  /** Default requests every shipped chart system; callers may still select a subset explicitly. */
  systems: z.array(ChartSystem).min(1).default(['western', 'bazi', 'ziwei', 'vedic']),
  western: WesternSettings.prefault({}),
  bazi: BaziSettings.prefault({}),
  ziwei: ZiweiSettings.prefault({}),
  vedic: VedicSettings.prefault({}),
});
export type CalculationSettings = z.infer<typeof CalculationSettings>;

/**
 * The full birth input contract (handoff §4). Note: JavaScript `Date` is never
 * part of any public contract — wall time is expressed as separate date/time
 * strings plus an IANA zone, and instants are ISO strings downstream.
 */
export const BirthInput = z
  .strictObject({
    schemaVersion: z.string().default(SCHEMA_VERSION),
    calendar: CalendarSystem,
    localDate: z.string().regex(DATE_RE, { error: 'localDate must be YYYY-MM-DD' }),
    localTime: z
      .string()
      .regex(TIME_RE, { error: 'localTime must be HH:mm or HH:mm:ss' })
      .optional(),
    timeAccuracy: TimeAccuracy,
    /** IANA zone id (e.g. "Asia/Shanghai"); validated against the bundled TZDB at runtime. */
    timezone: z.string().min(1),
    location: GeoLocation,
    /** Only meaningful for lunar input; ignored for gregorian. */
    lunarLeapMonth: z.boolean().optional(),
    /** Gender only where a rule genuinely depends on it (BaZi luck cycle direction, etc.). */
    ruleGender: z.enum(['male', 'female', 'unspecified']).optional(),
    /** Required only when the local time is ambiguous under historical DST. */
    dstDisambiguation: FoldChoice.optional(),
    settings: CalculationSettings.prefault({}),
  })
  .refine((v) => v.timeAccuracy === 'unknown' || v.localTime !== undefined, {
    error: 'localTime is required unless timeAccuracy is "unknown"',
    path: ['localTime'],
  });

/** Parsed BirthInput (defaults applied). */
export type BirthInput = z.infer<typeof BirthInput>;
/** Raw BirthInput as accepted from JSON (defaults optional). */
export type BirthInputRaw = z.input<typeof BirthInput>;

/** Parse untrusted JSON into a BirthInput or throw a Zod error (handled by the CLI). */
export function parseBirthInput(value: unknown): BirthInput {
  return BirthInput.parse(value);
}
