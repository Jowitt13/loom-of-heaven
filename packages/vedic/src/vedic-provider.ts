import { Engine } from 'caelus';
import { embeddedData } from 'caelus/data-embedded';
import { WARNING_CODES, makeWarning } from '@loom/contracts';
import type {
  EngineWarning,
  NormalizedBirthData,
  ProviderRef,
  VedicChartResult,
  VedicGraha,
  VedicSettings,
  VedicUnknownTimeStable,
} from '@loom/contracts';
import { deriveVedicClassifications } from './classifications.ts';
import { nakshatraOf } from './nakshatra.ts';
import { instantaneousPanchanga } from './panchanga.ts';
import { vaaraAtInstant } from './sunrise.ts';
import moment from 'moment-timezone';

/** Pinned numerical provider; its package version is independently source-bound in ADR 0013. */
export const CAELUS_VERSION = '0.23.0';
const PROVIDER: ProviderRef = { id: 'caelus', version: CAELUS_VERSION, license: 'MIT' };
const ENGINE = new Engine(embeddedData);
const MS_PER_DAY = 86_400_000;
const UNKNOWN_TIME_STABILITY_SAMPLE_MS = 60_000;
const UNIX_EPOCH_JD = 2_440_587.5;

const GRAHAS: readonly [VedicGraha, string][] = [
  ['Sun', 'sun'],
  ['Moon', 'moon'],
  ['Mercury', 'mercury'],
  ['Venus', 'venus'],
  ['Mars', 'mars'],
  ['Jupiter', 'jupiter'],
  ['Saturn', 'saturn'],
];

export interface VedicP2PositionInput {
  utcInstantMs: number;
  latitudeDeg: number;
  longitudeEastDeg: number;
}

export interface VedicP2Positions {
  grahas: Record<VedicGraha, number>;
  meanRahuLongitudeDeg: number;
  meanKetuLongitudeDeg: number;
  trueRahuLongitudeDeg: number;
  trueKetuLongitudeDeg: number;
  lagnaLongitudeDeg: number;
}

function norm360(value: number): number {
  const out = value % 360;
  return out < 0 ? out + 360 : out;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Pure P2 numerical core. It uses only Caelus's MIT embedded static data and its
 * `sidereal:lahiri` path; Swiss Ephemeris is never loaded at runtime. The fixture
 * regression is the external acceptance oracle for every returned field.
 */
export function computeVedicP2Positions(input: VedicP2PositionInput): VedicP2Positions {
  const jdUt = input.utcInstantMs / MS_PER_DAY + UNIX_EPOCH_JD;
  const chart = ENGINE.chartAt(jdUt, input.latitudeDeg, input.longitudeEastDeg, {
    zodiac: 'sidereal:lahiri',
    houseSystem: 'whole_sign',
  });
  const grahas = {} as Record<VedicGraha, number>;
  for (const [graha, body] of GRAHAS) grahas[graha] = round6(chart.bodies[body]!.lon);

  const meanRahuLongitudeDeg = round6(chart.bodies.mean_node.lon);
  const trueRahuLongitudeDeg = round6(chart.bodies.true_node.lon);
  return {
    grahas,
    meanRahuLongitudeDeg,
    meanKetuLongitudeDeg: round6(norm360(meanRahuLongitudeDeg + 180)),
    trueRahuLongitudeDeg,
    trueKetuLongitudeDeg: round6(norm360(trueRahuLongitudeDeg + 180)),
    lagnaLongitudeDeg: round6(chart.angles.asc),
  };
}

function samePanchanga(
  a: NonNullable<VedicUnknownTimeStable['panchanga']>,
  b: NonNullable<VedicUnknownTimeStable['panchanga']>,
): boolean {
  return (
    a.tithi.number === b.tithi.number &&
    a.tithi.paksha === b.tithi.paksha &&
    a.yoga.number === b.yoga.number &&
    a.karana.slot === b.karana.slot &&
    a.karana.name === b.karana.name
  );
}

/**
 * For an unknown birth time, inspect every local-civil minute rather than trust
 * the normalizer's noon anchor. A member may be emitted by P4 only if it is the
 * same at every sampled instant, including both DST-aware day endpoints. Lagna,
 * bhava, D9, Vaara and Vimshottari remain suppressed because they are intrinsically
 * time-of-day dependent even when a discrete classification happens not to change.
 */
export function stableUnknownTimeVedicFacts(
  normalized: NormalizedBirthData,
): VedicUnknownTimeStable {
  if (normalized.timeKnown) {
    throw new Error('stableUnknownTimeVedicFacts requires normalized.timeKnown === false');
  }
  const localStart = moment.tz(
    `${normalized.localDate} 00:00:00`,
    'YYYY-MM-DD HH:mm:ss',
    normalized.timezone,
  );
  const startUtcMs = localStart.valueOf();
  const endUtcMs = localStart.clone().add(1, 'day').valueOf();
  let moonNakshatra: VedicUnknownTimeStable['moonNakshatra'] = null;
  let panchanga: VedicUnknownTimeStable['panchanga'] = null;
  let moonStable = true;
  let panchangaStable = true;

  for (let utcMs = startUtcMs; utcMs <= endUtcMs; utcMs += UNKNOWN_TIME_STABILITY_SAMPLE_MS) {
    const positions = computeVedicP2Positions({
      utcInstantMs: Math.min(utcMs, endUtcMs),
      latitudeDeg: normalized.location.latitude,
      longitudeEastDeg: normalized.location.longitude,
    });
    const candidateMoon = nakshatraOf(positions.grahas.Moon);
    const candidatePanchanga = instantaneousPanchanga(positions.grahas.Sun, positions.grahas.Moon);
    if (moonNakshatra === null) moonNakshatra = candidateMoon;
    else if (
      moonNakshatra.index !== candidateMoon.index ||
      moonNakshatra.pada !== candidateMoon.pada
    ) {
      moonStable = false;
    }
    if (panchanga === null) panchanga = candidatePanchanga;
    else if (!samePanchanga(panchanga, candidatePanchanga)) {
      panchangaStable = false;
    }
    if (!moonStable && !panchangaStable) break;
  }

  return {
    moonNakshatra: moonStable ? moonNakshatra : null,
    panchanga: panchangaStable ? panchanga : null,
  };
}

/**
 * P2/P3 Vedic provider. Both node modes are emitted, so the unresolved Rahu
 * default cannot affect a chart silently. Vaara and the owner-confirmed
 * julian-365.25 Vimshottari model are enabled only by their P3B evidence gates.
 */
export function computeVedic(
  normalized: NormalizedBirthData,
  settings: VedicSettings,
): { result: VedicChartResult; warnings: EngineWarning[] } {
  const positions = computeVedicP2Positions({
    utcInstantMs: normalized.utcInstantMs,
    latitudeDeg: normalized.location.latitude,
    longitudeEastDeg: normalized.location.longitude,
  });
  const warnings: EngineWarning[] = [];
  let derived: VedicChartResult['derived'] = null;
  let unknownTimeStable: VedicChartResult['unknownTimeStable'] = null;
  if (normalized.timeKnown) {
    const vaara = vaaraAtInstant({
      utcMs: normalized.utcInstantMs,
      timezone: normalized.timezone,
      latitudeDeg: normalized.location.latitude,
      longitudeEastDeg: normalized.location.longitude,
    });
    if (vaara === null) {
      warnings.push(
        makeWarning(
          WARNING_CODES.VEDIC_SUNRISE_UNAVAILABLE,
          'vedic',
          'No nearby local sunrise is available for this location and instant; Vaara is omitted.',
          { severity: 'info' },
        ),
      );
    }
    const includeVimshottari = settings.dashaYear === 'julian-365.25';
    if (!includeVimshottari) {
      warnings.push(
        makeWarning(
          WARNING_CODES.VEDIC_DASHA_YEAR_UNSUPPORTED,
          'vedic',
          `Vimshottari dasha year model ${settings.dashaYear} is reserved for a future ruleset; only julian-365.25 is implemented.`,
          { severity: 'info', detail: { requestedDashaYear: settings.dashaYear } },
        ),
      );
    }
    derived = deriveVedicClassifications(positions, {
      birthUtcMs: normalized.utcInstantMs,
      vaara,
      includeVimshottari,
    });
  } else {
    unknownTimeStable = stableUnknownTimeVedicFacts(normalized);
    warnings.push(
      makeWarning(
        WARNING_CODES.VEDIC_TIME_REQUIRED,
        'vedic',
        'Birth time is unknown: time-of-day Vedic results are omitted; only whole-local-day-stable facts may be emitted.',
        { severity: 'info' },
      ),
    );
  }
  const result: VedicChartResult = {
    rulesetId: settings.rulesetId,
    provider: PROVIDER,
    ayanamsha: { id: 'lahiri-iae-1985', swissReferenceMode: 'SE_SIDM_LAHIRI' },
    grahas: GRAHAS.map(([graha]) => ({ graha, longitudeDeg: positions.grahas[graha] })),
    nodes: {
      mean: {
        rahuLongitudeDeg: positions.meanRahuLongitudeDeg,
        ketuLongitudeDeg: positions.meanKetuLongitudeDeg,
      },
      true: {
        rahuLongitudeDeg: positions.trueRahuLongitudeDeg,
        ketuLongitudeDeg: positions.trueKetuLongitudeDeg,
      },
    },
    // Normalization anchors an unknown wall time at noon only for date-based work;
    // that anchor must never become a claimed ascendant.
    lagnaLongitudeDeg: normalized.timeKnown ? positions.lagnaLongitudeDeg : null,
    // The same anchor must not leak as a derived natal classification. P4 owns the
    // finer day-stability and public warning policy for unknown birth times.
    derived,
    unknownTimeStable,
    precision: 'high',
  };
  return { result, warnings };
}
