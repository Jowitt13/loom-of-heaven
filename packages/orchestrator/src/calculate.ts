import {
  ChartBundle as ChartBundleSchema,
  ENGINE_VERSION,
  SCHEMA_VERSION,
  WARNING_CODES,
  canonicalJson,
  fnv1a64Hex,
  makeWarning,
} from '@ming/contracts';
import type {
  BirthInput,
  ChartBundle,
  ChartSystem,
  EngineWarning,
  NormalizedBirthData,
  ProviderRef,
  RulesetRef,
  ZiweiHoroscopeResult,
} from '@ming/contracts';
import {
  collectTimeWarnings,
  normalizeBirthData,
  toPublicNormalizedTime,
} from '@ming/time-location';
import { computeBazi, lunarToGregorian } from '@ming/bazi';
import { computeZiwei, computeZiweiHoroscope } from '@ming/ziwei';
import { computeWestern } from '@ming/western';
import { buildProvenance, parseRulesetId } from './provenance-build.ts';

export interface CalculateOptions {
  /** Injected wall-clock (epoch ms) for a deterministic `calculatedAt`. */
  now?: number;
  /** Override the deterministic request id (otherwise derived from the input). */
  requestId?: string;
}

export interface NormalizeResult {
  normalized: NormalizedBirthData;
  warnings: EngineWarning[];
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Resolve any lunar input to a Gregorian date before normalization (calendar
 * conversion is done once, by the calendar authority). Returns the resolved input
 * plus a LUNAR_CONVERTED warning; Gregorian input passes through unchanged.
 */
function resolveGregorianInput(input: BirthInput): {
  resolved: BirthInput;
  warnings: EngineWarning[];
} {
  if (input.calendar !== 'lunar') return { resolved: input, warnings: [] };

  const [y, mo, d] = input.localDate.split('-').map((v) => Number.parseInt(v, 10));
  const g = lunarToGregorian(y!, mo!, d!, input.lunarLeapMonth ?? false);
  const gregorianDate = `${g.year}-${pad2(g.month)}-${pad2(g.day)}`;
  const resolved: BirthInput = { ...input, calendar: 'gregorian', localDate: gregorianDate };
  const warnings = [
    makeWarning(
      WARNING_CODES.LUNAR_CONVERTED,
      'time',
      `Lunar date ${input.localDate}${input.lunarLeapMonth ? ' (leap month)' : ''} converted to Gregorian ${gregorianDate}.`,
      {
        severity: 'info',
        detail: {
          lunar: input.localDate,
          gregorian: gregorianDate,
          leapMonth: input.lunarLeapMonth ?? false,
        },
      },
    ),
  ];
  return { resolved, warnings };
}

/**
 * Deterministic request id: a hash of the canonical (original) input plus engine/
 * schema versions. Same input + versions => same id, from source or packaged Skill.
 */
export function computeRequestId(input: BirthInput): string {
  return `req_${fnv1a64Hex(`${canonicalJson(input)}|${ENGINE_VERSION}|${SCHEMA_VERSION}`)}`;
}

/** Normalize only (CLI `normalize`): rich record + time-layer warnings (handles lunar). */
export function runNormalize(input: BirthInput): NormalizeResult {
  const { resolved, warnings: calendarWarnings } = resolveGregorianInput(input);
  const normalized = normalizeBirthData(resolved);
  return {
    normalized,
    warnings: [...calendarWarnings, ...collectTimeWarnings(resolved, normalized)],
  };
}

export interface HoroscopeOptions {
  /** Target solar date (YYYY-MM-DD) for the dynamic chart. */
  solarDate: string;
  /** Double-hour index for 流时 (0=早子 … 12=晚子). */
  timeIndex: number;
}

/**
 * Zi Wei dynamic chart (CLI `horoscope`). Normalizes once, then computes the
 * 运限盘 (大限/小限/流年/流月/流日/流时) for a target solar date. Returns null
 * (with a ZIWEI_INPUT_REQUIRED warning) when the birth time or gender is missing.
 */
export function runHoroscope(
  input: BirthInput,
  options: HoroscopeOptions,
): { horoscope: ZiweiHoroscopeResult | null; warnings: EngineWarning[] } {
  const { resolved, warnings: calendarWarnings } = resolveGregorianInput(input);
  const normalized = normalizeBirthData(resolved);
  const warnings: EngineWarning[] = [
    ...calendarWarnings,
    ...collectTimeWarnings(resolved, normalized),
  ];
  const { result, warnings: ziweiWarnings } = computeZiweiHoroscope(
    normalized,
    resolved.settings.ziwei,
    resolved.ruleGender,
    options,
  );
  warnings.push(...ziweiWarnings);
  return { horoscope: result, warnings };
}

/**
 * Full calculation (CLI `calculate`). BaZi is computed by its deterministic
 * provider; Western and Zi Wei still emit SYSTEM_NOT_YET_IMPLEMENTED until their
 * providers land. The LLM never backfills a missing system (handoff §0, §12).
 */
export function calculate(input: BirthInput, options: CalculateOptions = {}): ChartBundle {
  const { resolved, warnings: calendarWarnings } = resolveGregorianInput(input);
  const normalized = normalizeBirthData(resolved);

  const warnings: EngineWarning[] = [
    ...calendarWarnings,
    ...collectTimeWarnings(resolved, normalized),
  ];
  const providers: ProviderRef[] = [];
  const rulesets: RulesetRef[] = [];

  const bundle: ChartBundle = {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    requestId: options.requestId ?? computeRequestId(input),
    calculatedAt: new Date(options.now ?? Date.now()).toISOString(),
    originalInput: input,
    normalizedTime: toPublicNormalizedTime(normalized),
    warnings,
    provenance: buildProvenance(normalized, providers, rulesets),
  };

  for (const system of resolved.settings.systems) {
    if (system === 'bazi') {
      const { result, warnings: baziWarnings } = computeBazi(
        normalized,
        resolved.settings.bazi,
        resolved.ruleGender,
      );
      bundle.bazi = result;
      warnings.push(...baziWarnings);
      providers.push(result.provider);
      rulesets.push(parseRulesetId(result.rulesetId));
    } else if (system === 'ziwei') {
      const { result, warnings: ziweiWarnings } = computeZiwei(
        normalized,
        resolved.settings.ziwei,
        resolved.ruleGender,
      );
      warnings.push(...ziweiWarnings);
      if (result !== null) {
        bundle.ziwei = result;
        providers.push(result.provider);
        rulesets.push(parseRulesetId(result.rulesetId));
      }
    } else if (system === 'western') {
      const { result, warnings: westernWarnings } = computeWestern(
        normalized,
        resolved.settings.western,
      );
      warnings.push(...westernWarnings);
      if (result !== null) {
        bundle.western = result;
        providers.push(result.provider);
        rulesets.push(parseRulesetId(result.rulesetId));
      }
    } else {
      warnings.push(pendingSystemWarning(system));
    }
  }

  bundle.provenance = buildProvenance(normalized, providers, rulesets);
  return ChartBundleSchema.parse(bundle);
}

function pendingSystemWarning(system: ChartSystem): EngineWarning {
  return makeWarning(
    WARNING_CODES.SYSTEM_NOT_YET_IMPLEMENTED,
    system,
    `The ${system} provider lands in a later Phase 2 slice; engine ${ENGINE_VERSION} does not fabricate ${system} results.`,
    { severity: 'info' },
  );
}
