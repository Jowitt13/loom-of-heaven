import { ChildLimit, Gender, HeavenStem, SixtyCycle, SolarTime } from 'tyme4ts';
import { WARNING_CODES, makeWarning } from '@loom/contracts';
import type {
  BaziChartResult,
  BaziMajorCycle,
  BaziPillar,
  BaziSettings,
  EngineWarning,
  NormalizedBirthData,
  ProviderRef,
} from '@loom/contracts';

/** Pinned tyme4ts version (authoritative record is sbom.cdx.json, regenerated at build). */
export const TYME4TS_VERSION = '1.5.2';
const PROVIDER: ProviderRef = { id: 'tyme4ts', version: TYME4TS_VERSION, license: 'MIT' };

/** Heaven stems whose polarity is yang (阳); the rest are yin (阴). */
const YANG_STEMS = new Set(['甲', '丙', '戊', '庚', '壬']);
const MAJOR_CYCLE_COUNT = 8;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

interface WallParts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

function partsFromCivil(n: NormalizedBirthData): WallParts {
  const [y, mo, d] = n.localDate.split('-').map((v) => Number.parseInt(v, 10));
  const [h, mi, s] = n.localTime.split(':').map((v) => Number.parseInt(v, 10));
  return { y: y!, mo: mo!, d: d!, h: h!, mi: mi!, s: s! };
}

function partsFromSolarIso(iso: string): WallParts {
  const [datePart, timePart] = iso.split('T');
  const [y, mo, d] = datePart!.split('-').map((v) => Number.parseInt(v, 10));
  const [h, mi, s] = timePart!.split(':').map((v) => Number.parseInt(v, 10));
  return { y: y!, mo: mo!, d: d!, h: h!, mi: mi!, s: s! };
}

function pillarFrom(
  cycle: SixtyCycle,
  dayMasterStem: HeavenStem,
  isDayPillar: boolean,
  includeZodiac: boolean,
): BaziPillar {
  const stem = cycle.getHeavenStem();
  const branch = cycle.getEarthBranch();
  const stemName = stem.getName();

  const hiddenStems = branch.getHideHeavenStems().map((hidden, index) => {
    const s = hidden.getHeavenStem();
    return {
      stem: s.getName(),
      element: s.getElement().getName(),
      tenGod: dayMasterStem.getTenStar(s).getName(),
      primary: index === 0,
    };
  });

  const tenGod = isDayPillar ? null : dayMasterStem.getTenStar(stem).getName();
  const pillar: BaziPillar = {
    stem: stemName,
    branch: branch.getName(),
    stemElement: stem.getElement().getName(),
    branchElement: branch.getElement().getName(),
    stemYinYang: YANG_STEMS.has(stemName) ? '阳' : '阴',
    naYin: cycle.getSound().getName(),
    tenGod,
    // Always non-null so every host renders the day column: the day master has no
    // ten-god relative to itself, so it shows "日主(日元)".
    tenGodDisplay: tenGod ?? '日主(日元)',
    hiddenStems,
  };
  if (includeZodiac) pillar.zodiac = branch.getZodiac().getName();
  return pillar;
}

/**
 * Compute the BaZi chart from normalized time + versioned settings. Hides all
 * tyme4ts types behind the project contract. Returns the result plus honest
 * warnings for anything not fully implemented (day-boundary variants, missing
 * gender, solar mode unavailable for unknown time).
 */
export function computeBazi(
  normalized: NormalizedBirthData,
  settings: BaziSettings,
  ruleGender: 'male' | 'female' | 'unspecified' | undefined,
): { result: BaziChartResult; warnings: EngineWarning[] } {
  const warnings: EngineWarning[] = [];

  // Choose the local time base. Solar modes only apply when the time is known.
  let solarTimeApplied: 'civil' | 'mean' | 'apparent' = settings.solarTimeMode;
  let parts: WallParts;
  if (settings.solarTimeMode !== 'civil' && normalized.solar !== null) {
    const iso =
      settings.solarTimeMode === 'mean'
        ? normalized.solar.meanSolarTimeIso
        : normalized.solar.apparentSolarTimeIso;
    parts = partsFromSolarIso(iso);
  } else {
    if (settings.solarTimeMode !== 'civil') {
      solarTimeApplied = 'civil';
      warnings.push(
        makeWarning(
          WARNING_CODES.RULESET_VARIANT_DEFAULTED,
          'bazi',
          `Solar-time mode "${settings.solarTimeMode}" needs a known birth time; civil time was used instead.`,
          { severity: 'info' },
        ),
      );
    }
    parts = partsFromCivil(normalized);
  }

  // tyme4ts uses late-zi / zi-hour day boundary (day advances at 23:00). Warn if a
  // different, not-yet-implemented variant was requested.
  if (settings.dayBoundary !== 'zi-hour' || settings.earlyLateZi !== 'late') {
    warnings.push(
      makeWarning(
        WARNING_CODES.RULESET_VARIANT_DEFAULTED,
        'bazi',
        `Requested day-boundary "${settings.dayBoundary}/${settings.earlyLateZi}-zi" is not implemented yet; the tyme4ts default (zi-hour, late-zi) was applied.`,
        { severity: 'info' },
      ),
    );
  }

  const solarTime = SolarTime.fromYmdHms(parts.y, parts.mo, parts.d, parts.h, parts.mi, parts.s);
  const eightChar = solarTime.getLunarHour().getEightChar();
  const dayMasterStem = eightChar.getDay().getHeavenStem();

  const pillars = {
    year: pillarFrom(eightChar.getYear(), dayMasterStem, false, true),
    month: pillarFrom(eightChar.getMonth(), dayMasterStem, false, false),
    day: pillarFrom(eightChar.getDay(), dayMasterStem, true, false),
    hour: normalized.timeKnown
      ? pillarFrom(eightChar.getHour(), dayMasterStem, false, false)
      : null,
  };

  const luckCycle = computeLuckCycle(solarTime, normalized, ruleGender, warnings);

  const result: BaziChartResult = {
    rulesetId: settings.rulesetId,
    provider: PROVIDER,
    solarTimeApplied,
    dayBoundaryApplied: 'zi-hour/late (tyme4ts default)',
    dayMaster: {
      stem: dayMasterStem.getName(),
      element: dayMasterStem.getElement().getName(),
      yinYang: YANG_STEMS.has(dayMasterStem.getName()) ? '阳' : '阴',
    },
    pillars,
    luckCycle,
  };

  return { result, warnings };
}

function computeLuckCycle(
  solarTime: SolarTime,
  normalized: NormalizedBirthData,
  ruleGender: 'male' | 'female' | 'unspecified' | undefined,
  warnings: EngineWarning[],
): BaziChartResult['luckCycle'] {
  if (!normalized.timeKnown) return null;
  if (ruleGender !== 'male' && ruleGender !== 'female') {
    warnings.push(
      makeWarning(
        WARNING_CODES.BAZI_GENDER_REQUIRED,
        'bazi',
        'The luck cycle (大运/起运) depends on gender; provide ruleGender "male" or "female" to compute it.',
        { severity: 'info' },
      ),
    );
    return null;
  }

  const childLimit = ChildLimit.fromSolarTime(
    solarTime,
    ruleGender === 'male' ? Gender.MAN : Gender.WOMAN,
  );
  const startDay = childLimit.getStartTime().getSolarDay();

  const majorCycles: BaziMajorCycle[] = [];
  let fortune = childLimit.getStartDecadeFortune();
  for (let index = 0; index < MAJOR_CYCLE_COUNT; index++) {
    const cycle = fortune.getSixtyCycle();
    majorCycles.push({
      index,
      startAge: fortune.getStartAge(),
      endAge: fortune.getEndAge(),
      startYear: fortune.getStartLunarYear().getYear(),
      stem: cycle.getHeavenStem().getName(),
      branch: cycle.getEarthBranch().getName(),
      naYin: cycle.getSound().getName(),
    });
    fortune = fortune.next(1);
  }

  return {
    forward: childLimit.isForward(),
    startAfter: {
      years: childLimit.getYearCount(),
      months: childLimit.getMonthCount(),
      days: childLimit.getDayCount(),
    },
    startSolarDate: `${startDay.getYear()}-${pad2(startDay.getMonth())}-${pad2(startDay.getDay())}`,
    majorCycles,
  };
}
