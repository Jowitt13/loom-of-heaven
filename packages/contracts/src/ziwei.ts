import { z } from 'zod';
import { ProviderRef } from './provenance.ts';

/**
 * Zi Wei Dou Shu (紫微斗数) domain schema. Distinct from Western/BaZi (handoff §6).
 * Records the natal twelve palaces, stars with brightness and four-transformations
 * (四化), and the major limits (大限). iztro's own types never leak past this contract.
 */

/** A star placed in a palace, with brightness (庙旺利陷) and 四化 mutagen when present. */
export const ZiweiStar = z.object({
  name: z.string(),
  /** Star category: major (主星) / minor (辅星) / adjective (杂曜) etc. */
  type: z.string(),
  brightness: z.string().optional(),
  /** Four-transformation (四化): 禄/权/科/忌 when present. */
  mutagen: z.string().optional(),
});
export type ZiweiStar = z.infer<typeof ZiweiStar>;

/** One of the twelve palaces (十二宫). */
/** The 三方四正 (three-harmony/four-cardinal) of a palace: its 对宫 (opposite),
 * 财帛 (wealth) and 官禄 (career) palace names. The palace itself is the fourth. */
export const ZiweiSurPalaces = z.object({
  opposite: z.string(),
  wealth: z.string(),
  career: z.string(),
});
export type ZiweiSurPalaces = z.infer<typeof ZiweiSurPalaces>;

/** One of the twelve palaces (十二宫). */
export const ZiweiPalace = z.object({
  index: z.number().int(),
  name: z.string(),
  heavenlyStem: z.string(),
  earthlyBranch: z.string(),
  /** 命宫 */
  isSoulPalace: z.boolean(),
  /** 身宫 */
  isBodyPalace: z.boolean(),
  majorStars: z.array(ZiweiStar),
  minorStars: z.array(ZiweiStar),
  adjectiveStars: z.array(ZiweiStar),
  /** 三方四正: this palace's 对宫 / 财帛 / 官禄 (the palace itself completes the four). */
  surroundPalaces: ZiweiSurPalaces,
  /** Major limit (大限): age range + palace stem/branch. */
  decadal: z.object({
    startAge: z.number().int(),
    endAge: z.number().int(),
    heavenlyStem: z.string(),
    earthlyBranch: z.string(),
  }),
});
export type ZiweiPalace = z.infer<typeof ZiweiPalace>;

export const ZiweiChartResult = z.object({
  rulesetId: z.string(),
  provider: ProviderRef,
  gender: z.string(),
  useApparentSolarTime: z.boolean(),
  /** Double-hour index used (0=早子 … 12=晚子). */
  timeIndex: z.number().int(),
  lunarDate: z.string(),
  sign: z.string(),
  zodiac: z.string(),
  soul: z.string(),
  body: z.string(),
  fiveElementsClass: z.string(),
  soulPalaceBranch: z.string(),
  bodyPalaceBranch: z.string(),
  palaces: z.array(ZiweiPalace),
});
export type ZiweiChartResult = z.infer<typeof ZiweiChartResult>;

/** One dynamic-limit (运限) block: decadal 大限 / age 小限 / yearly 流年 / monthly 流月 /
 * daily 流日 / hourly 流时. Carries the re-placed twelve palace names, the limit's
 * four-transformations (运限四化) and its transient stars (流耀). */
export const ZiweiHoroscopeItem = z.object({
  /** Palace index this limit sits in. */
  index: z.number().int(),
  /** Limit palace name. */
  name: z.string(),
  heavenlyStem: z.string(),
  earthlyBranch: z.string(),
  /** The twelve palace names re-placed for this limit. */
  palaceNames: z.array(z.string()),
  /** 运限四化 (the stars transformed by this limit's stem). */
  mutagen: z.array(z.string()),
  /** 流耀: transient star groups (each a list of star names), when present. */
  stars: z.array(z.array(z.string())).optional(),
});
export type ZiweiHoroscopeItem = z.infer<typeof ZiweiHoroscopeItem>;

/** A Zi Wei dynamic chart (运限盘) for a target date: 大限/小限/流年/流月/流日/流时. */
export const ZiweiHoroscope = z.object({
  lunarDate: z.string(),
  solarDate: z.string(),
  decadal: ZiweiHoroscopeItem,
  age: ZiweiHoroscopeItem.extend({ nominalAge: z.number().int() }),
  yearly: ZiweiHoroscopeItem.extend({
    /** 流年将前十二星 / 岁前十二星. */
    yearlyDecStar: z.object({
      jiangqian12: z.array(z.string()),
      suiqian12: z.array(z.string()),
    }),
  }),
  monthly: ZiweiHoroscopeItem,
  daily: ZiweiHoroscopeItem,
  hourly: ZiweiHoroscopeItem,
});
export type ZiweiHoroscope = z.infer<typeof ZiweiHoroscope>;

/** The horoscope result for a target solar date + double-hour, with provenance. */
export const ZiweiHoroscopeResult = z.object({
  rulesetId: z.string(),
  provider: ProviderRef,
  /** Target solar date (YYYY-MM-DD) the dynamic chart was computed for. */
  targetSolarDate: z.string(),
  /** Double-hour index used for 流时 (0=早子 … 12=晚子). */
  targetTimeIndex: z.number().int(),
  horoscope: ZiweiHoroscope,
});
export type ZiweiHoroscopeResult = z.infer<typeof ZiweiHoroscopeResult>;
