import { astro } from 'iztro';
import { WARNING_CODES, makeWarning } from '@loom/contracts';
import type {
  EngineWarning,
  NormalizedBirthData,
  ProviderRef,
  ZiweiChartResult,
  ZiweiHoroscopeItem,
  ZiweiHoroscopeResult,
  ZiweiPalace,
  ZiweiSettings,
  ZiweiStar,
} from '@loom/contracts';

/** Pinned iztro version (authoritative record is sbom.cdx.json, regenerated at build). */
export const IZTRO_VERSION = '2.5.8';
const PROVIDER: ProviderRef = { id: 'iztro', version: IZTRO_VERSION, license: 'MIT' };

interface IztroStar {
  name: string;
  type: string;
  brightness?: string;
  mutagen?: string;
}

/** iztro's dynamic-limit (运限) block shape (only the fields we read). */
interface IztroHoroscopeItem {
  index: number;
  name: string;
  heavenlyStem: string;
  earthlyBranch: string;
  palaceNames: string[];
  mutagen: string[];
  stars?: Array<Array<{ name: string }>>;
}

/** Double-hour index for iztro: 0=早子 (00:00) … 11=亥 (21:00) … 12=晚子 (23:00). */
export function timeIndexFromHour(hour: number): number {
  return Math.floor((hour + 1) / 2);
}

function mapStar(star: IztroStar): ZiweiStar {
  const out: ZiweiStar = { name: star.name, type: star.type };
  if (star.brightness) out.brightness = star.brightness;
  if (star.mutagen) out.mutagen = star.mutagen;
  return out;
}

/**
 * Build the natal iztro astrolabe from normalized time + settings. Requires a known
 * birth time and a gender rule (palaces, 命主/身主, 大限 and every 运限 depend on
 * them); when either is missing nothing is computed and a warning is returned.
 */
function buildAstrolabe(
  normalized: NormalizedBirthData,
  settings: ZiweiSettings,
  ruleGender: 'male' | 'female' | 'unspecified' | undefined,
): {
  astrolabe: ReturnType<typeof astro.bySolar> | null;
  warnings: EngineWarning[];
  useApparent: boolean;
} {
  if (!normalized.timeKnown || (ruleGender !== 'male' && ruleGender !== 'female')) {
    return {
      astrolabe: null,
      useApparent: false,
      warnings: [
        makeWarning(
          WARNING_CODES.ZIWEI_INPUT_REQUIRED,
          'ziwei',
          'Zi Wei Dou Shu needs a known birth time and a gender rule ("male"/"female"); the chart was not computed.',
          { severity: 'info' },
        ),
      ],
    };
  }

  const useApparent = settings.useApparentSolarTime && normalized.solar !== null;
  let dateStr: string;
  let hour: number;
  if (useApparent && normalized.solar !== null) {
    const [datePart, timePart] = normalized.solar.apparentSolarTimeIso.split('T');
    dateStr = datePart!;
    hour = Number.parseInt(timePart!.slice(0, 2), 10);
  } else {
    dateStr = normalized.localDate;
    hour = Number.parseInt(normalized.localTime.slice(0, 2), 10);
  }

  const timeIndex = timeIndexFromHour(hour);
  const gender = ruleGender === 'male' ? '男' : '女';
  return {
    astrolabe: astro.bySolar(dateStr, timeIndex, gender, true, 'zh-CN'),
    warnings: [],
    useApparent,
  };
}

function birthTimeIndex(normalized: NormalizedBirthData, settings: ZiweiSettings): number {
  const useApparent = settings.useApparentSolarTime && normalized.solar !== null;
  if (useApparent && normalized.solar !== null) {
    const timePart = normalized.solar.apparentSolarTimeIso.split('T')[1]!;
    return timeIndexFromHour(Number.parseInt(timePart.slice(0, 2), 10));
  }
  return timeIndexFromHour(Number.parseInt(normalized.localTime.slice(0, 2), 10));
}

/**
 * Compute the natal Zi Wei chart from normalized time + settings. Hides all iztro
 * types behind the project contract, and records each palace's 三方四正.
 */
export function computeZiwei(
  normalized: NormalizedBirthData,
  settings: ZiweiSettings,
  ruleGender: 'male' | 'female' | 'unspecified' | undefined,
): { result: ZiweiChartResult | null; warnings: EngineWarning[] } {
  const { astrolabe, warnings, useApparent } = buildAstrolabe(normalized, settings, ruleGender);
  if (astrolabe === null) return { result: null, warnings };

  const palaces: ZiweiPalace[] = astrolabe.palaces.map((palace) => {
    const surround = astrolabe.surroundedPalaces(palace.index);
    return {
      index: palace.index,
      name: palace.name,
      heavenlyStem: palace.heavenlyStem,
      earthlyBranch: palace.earthlyBranch,
      isSoulPalace: palace.name === '命宫',
      isBodyPalace: palace.isBodyPalace,
      majorStars: (palace.majorStars as IztroStar[]).map(mapStar),
      minorStars: (palace.minorStars as IztroStar[]).map(mapStar),
      adjectiveStars: (palace.adjectiveStars as IztroStar[]).map(mapStar),
      surroundPalaces: {
        opposite: surround.opposite.name,
        wealth: surround.wealth.name,
        career: surround.career.name,
      },
      decadal: {
        startAge: palace.decadal.range[0]!,
        endAge: palace.decadal.range[1]!,
        heavenlyStem: palace.decadal.heavenlyStem,
        earthlyBranch: palace.decadal.earthlyBranch,
      },
    };
  });

  const result: ZiweiChartResult = {
    rulesetId: settings.rulesetId,
    provider: PROVIDER,
    gender: ruleGender === 'male' ? '男' : '女',
    useApparentSolarTime: useApparent,
    timeIndex: birthTimeIndex(normalized, settings),
    lunarDate: astrolabe.lunarDate,
    sign: astrolabe.sign,
    zodiac: astrolabe.zodiac,
    soul: astrolabe.soul,
    body: astrolabe.body,
    fiveElementsClass: astrolabe.fiveElementsClass,
    soulPalaceBranch: astrolabe.earthlyBranchOfSoulPalace,
    bodyPalaceBranch: astrolabe.earthlyBranchOfBodyPalace,
    palaces,
  };

  return { result, warnings };
}

function mapHoroscopeItem(item: IztroHoroscopeItem): ZiweiHoroscopeItem {
  const out: ZiweiHoroscopeItem = {
    index: item.index,
    name: item.name,
    heavenlyStem: item.heavenlyStem,
    earthlyBranch: item.earthlyBranch,
    palaceNames: [...item.palaceNames],
    mutagen: [...item.mutagen],
  };
  if (item.stars) out.stars = item.stars.map((group) => group.map((s) => s.name));
  return out;
}

/**
 * Compute the Zi Wei dynamic chart (运限盘: 大限/小限/流年/流月/流日/流时) for a target
 * solar date + double-hour, from the same natal astrolabe. Requires a known birth
 * time and gender rule, exactly like the natal chart.
 */
export function computeZiweiHoroscope(
  normalized: NormalizedBirthData,
  settings: ZiweiSettings,
  ruleGender: 'male' | 'female' | 'unspecified' | undefined,
  target: { solarDate: string; timeIndex: number },
): { result: ZiweiHoroscopeResult | null; warnings: EngineWarning[] } {
  const { astrolabe, warnings } = buildAstrolabe(normalized, settings, ruleGender);
  if (astrolabe === null) return { result: null, warnings };

  const h = astrolabe.horoscope(target.solarDate, target.timeIndex);
  const result: ZiweiHoroscopeResult = {
    rulesetId: settings.rulesetId,
    provider: PROVIDER,
    targetSolarDate: target.solarDate,
    targetTimeIndex: target.timeIndex,
    horoscope: {
      lunarDate: h.lunarDate,
      solarDate: h.solarDate,
      decadal: mapHoroscopeItem(h.decadal as IztroHoroscopeItem),
      age: { ...mapHoroscopeItem(h.age as IztroHoroscopeItem), nominalAge: h.age.nominalAge },
      yearly: {
        ...mapHoroscopeItem(h.yearly as IztroHoroscopeItem),
        yearlyDecStar: {
          jiangqian12: [...h.yearly.yearlyDecStar.jiangqian12],
          suiqian12: [...h.yearly.yearlyDecStar.suiqian12],
        },
      },
      monthly: mapHoroscopeItem(h.monthly as IztroHoroscopeItem),
      daily: mapHoroscopeItem(h.daily as IztroHoroscopeItem),
      hourly: mapHoroscopeItem(h.hourly as IztroHoroscopeItem),
    },
  };

  return { result, warnings };
}
