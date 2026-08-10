import {
  EngineError,
  ERROR_CODES,
  SCHEMA_VERSION,
  SUPPORTED_YEAR_MAX,
  SUPPORTED_YEAR_MIN,
  WARNING_CODES,
  makeWarning,
} from '@loom/contracts';
import type {
  AmbiguityInfo,
  BirthInput,
  EngineWarning,
  NormalizedBirthData,
  NormalizedTimePublic,
} from '@loom/contracts';
import { NormalizedBirthData as NormalizedBirthDataSchema } from '@loom/contracts';
import { resolveWallClock } from './disambiguate.ts';
import { computeSolarTime } from './solar-time.ts';
import { tzdbRef, zoneExists } from './tzdb.ts';
import {
  formatLocalCivil,
  formatUtcInstant,
  normalizeTimeString,
  parseWallToMs,
} from './format.ts';

const UNKNOWN_TIME_ANCHOR = '12:00:00';
const BOUNDARY_THRESHOLD_SECONDS = 120;

/**
 * Normalize a birth input exactly once into a reproducible time+location record.
 * Throws a typed EngineError for the distinct time failures (lunar not yet
 * supported, out-of-range, unknown zone, nonexistent/ambiguous local time).
 */
export function normalizeBirthData(input: BirthInput): NormalizedBirthData {
  if (input.calendar === 'lunar') {
    throw new EngineError(
      ERROR_CODES.LUNAR_CONVERSION_UNAVAILABLE,
      'Lunar calendar input requires the calendar provider (Phase 2). Convert to a Gregorian date first or supply calendar="gregorian".',
      { calendar: input.calendar },
    );
  }

  const year = Number.parseInt(input.localDate.slice(0, 4), 10);
  if (year < SUPPORTED_YEAR_MIN || year > SUPPORTED_YEAR_MAX) {
    throw new EngineError(
      ERROR_CODES.DATE_OUT_OF_RANGE,
      `Year ${year} is outside the supported range ${SUPPORTED_YEAR_MIN}-${SUPPORTED_YEAR_MAX}.`,
      { year, min: SUPPORTED_YEAR_MIN, max: SUPPORTED_YEAR_MAX },
    );
  }

  if (!zoneExists(input.timezone)) {
    throw new EngineError(
      ERROR_CODES.UNKNOWN_TIMEZONE,
      `Unknown IANA time zone "${input.timezone}". Provide a valid zone id such as "Asia/Shanghai".`,
      { timezone: input.timezone },
    );
  }

  const timeKnown = input.timeAccuracy !== 'unknown';
  const effectiveTime = timeKnown
    ? normalizeTimeString(input.localTime as string)
    : UNKNOWN_TIME_ANCHOR;

  const wallMs = parseWallToMs(input.localDate, effectiveTime);
  const candidates = resolveWallClock(wallMs, input.timezone);

  if (candidates.length === 0) {
    throw new EngineError(
      ERROR_CODES.NONEXISTENT_LOCAL_TIME,
      `Local time ${input.localDate}T${effectiveTime} does not exist in ${input.timezone} (spring-forward DST gap). Choose a time outside the gap.`,
      { localDate: input.localDate, localTime: effectiveTime, timezone: input.timezone },
    );
  }

  let chosen = candidates[0]!;
  let ambiguity: AmbiguityInfo;

  if (!timeKnown) {
    ambiguity = { status: 'not-applicable-unknown-time', candidateCount: candidates.length };
  } else if (candidates.length === 1) {
    ambiguity = { status: 'unambiguous', candidateCount: 1 };
  } else {
    if (input.dstDisambiguation === undefined) {
      throw new EngineError(
        ERROR_CODES.AMBIGUOUS_LOCAL_TIME,
        `Local time ${input.localDate}T${effectiveTime} occurs twice in ${input.timezone} (autumn fall-back DST). Set dstDisambiguation to "earlier" or "later".`,
        {
          localDate: input.localDate,
          localTime: effectiveTime,
          timezone: input.timezone,
          candidates: candidates.map((c) => ({
            utcInstant: formatUtcInstant(c.utcMs),
            offsetEastMinutes: c.offsetEastMin,
          })),
        },
      );
    }
    chosen =
      input.dstDisambiguation === 'earlier' ? candidates[0]! : candidates[candidates.length - 1]!;
    ambiguity = {
      status: 'ambiguous-resolved',
      candidateCount: candidates.length,
      resolution: input.dstDisambiguation,
    };
  }

  const [datePart, timePart] = formatLocalCivilParts(input.localDate, effectiveTime);
  const localCivilIso = formatLocalCivil(wallMs, chosen.offsetEastMin);
  const solar = timeKnown ? computeSolarTime(chosen.utcMs, input.location.longitude) : null;

  const normalized: NormalizedBirthData = {
    schemaVersion: SCHEMA_VERSION,
    calendar: input.calendar,
    timeAccuracy: input.timeAccuracy,
    timeKnown,
    localDate: datePart,
    localTime: timePart,
    localCivilIso,
    timezone: input.timezone,
    timezoneOffsetMinutes: chosen.offsetEastMin,
    utcInstant: formatUtcInstant(chosen.utcMs),
    utcInstantMs: chosen.utcMs,
    ambiguity,
    location: input.location,
    solar,
    tzdb: tzdbRef(),
  };

  // Defensive: guarantee schema conformity before it leaves this layer.
  return NormalizedBirthDataSchema.parse(normalized);
}

function formatLocalCivilParts(dateIso: string, timeIso: string): [string, string] {
  return [dateIso, normalizeTimeString(timeIso)];
}

/** Derive the time-layer warnings for a normalized result (handoff §3.3, §9). */
export function collectTimeWarnings(
  input: BirthInput,
  normalized: NormalizedBirthData,
): EngineWarning[] {
  const warnings: EngineWarning[] = [];

  if (!normalized.timeKnown) {
    warnings.push(
      makeWarning(
        WARNING_CODES.TIME_UNKNOWN,
        'time',
        'Birth time unknown: time-of-day results (ascendant, houses, hour pillar, Zi Wei hour) are suppressed. Date anchored to 12:00 local.',
      ),
    );
  } else if (input.timeAccuracy === 'approximate') {
    warnings.push(
      makeWarning(
        WARNING_CODES.TIME_ACCURACY_APPROXIMATE,
        'time',
        'Birth time is approximate: results near hour/house/solar-term boundaries may shift.',
        { severity: 'info' },
      ),
    );
  }

  if (normalized.ambiguity.status === 'ambiguous-resolved') {
    warnings.push(
      makeWarning(
        WARNING_CODES.DST_AMBIGUOUS_RESOLVED,
        'time',
        `Local time was ambiguous under historical DST and resolved to the "${normalized.ambiguity.resolution}" occurrence.`,
        { detail: { resolution: normalized.ambiguity.resolution } },
      ),
    );
  }

  if (normalized.solar !== null) {
    warnings.push(
      makeWarning(
        WARNING_CODES.SOLAR_TIME_APPROXIMATE,
        'time',
        `Apparent solar time uses the ${normalized.solar.method} equation-of-time approximation (~tenths of a minute).`,
        { severity: 'info', detail: { method: normalized.solar.method } },
      ),
    );
  }

  if (normalized.timeKnown) {
    const [h, m, s] = normalized.localTime.split(':').map((v) => Number.parseInt(v, 10));
    const secondsFromMidnight = h! * 3600 + m! * 60 + s!;
    const nearMidnight =
      secondsFromMidnight <= BOUNDARY_THRESHOLD_SECONDS ||
      secondsFromMidnight >= 86_400 - BOUNDARY_THRESHOLD_SECONDS;
    const nearZiHour = Math.abs(secondsFromMidnight - 23 * 3600) <= BOUNDARY_THRESHOLD_SECONDS;
    if (nearMidnight || nearZiHour) {
      warnings.push(
        makeWarning(
          WARNING_CODES.NEAR_BOUNDARY,
          'time',
          'Local time is within ~2 minutes of a day/zi-hour boundary; BaZi day and hour pillars are sensitive to the chosen day-boundary ruleset.',
          { severity: 'info', detail: { secondsFromMidnight } },
        ),
      );
    }
  }

  return warnings;
}

/** Project the rich normalized record onto the public bundle subset (handoff §6). */
export function toPublicNormalizedTime(normalized: NormalizedBirthData): NormalizedTimePublic {
  const ambiguityResolution =
    normalized.ambiguity.status === 'ambiguous-resolved'
      ? normalized.ambiguity.resolution
      : normalized.ambiguity.status;

  const projection: NormalizedTimePublic = {
    localCivil: normalized.localCivilIso,
    timezone: normalized.timezone,
    utcInstant: normalized.utcInstant,
    timezoneDataVersion: normalized.tzdb.version,
    ambiguityResolution,
  };
  if (normalized.solar !== null) {
    projection.meanSolarTime = normalized.solar.meanSolarTimeIso;
    projection.apparentSolarTime = normalized.solar.apparentSolarTimeIso;
  }
  return projection;
}
