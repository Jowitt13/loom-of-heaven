import { z } from 'zod';
import { ProviderRef } from './provenance.ts';

/**
 * BaZi (Four Pillars / 四柱八字) domain schema. Kept distinct from Western/Zi Wei
 * (handoff §6): only objectively reproducible calendar/structure results are
 * modeled here — no 格局/强弱/喜用神 verdicts (those are sourced interpretation
 * rules for a later phase). Names are the canonical Chinese terms produced by the
 * provider; the provider's own types never leak past this contract.
 */

/** One hidden stem (藏干) inside an earth branch, with its ten-god vs the day master. */
export const BaziHiddenStem = z.object({
  stem: z.string(),
  element: z.string(),
  tenGod: z.string(),
  /** True for the branch's main qi (本气). */
  primary: z.boolean(),
});
export type BaziHiddenStem = z.infer<typeof BaziHiddenStem>;

/** A single pillar (年/月/日/时): stem + branch with derived attributes. */
export const BaziPillar = z.object({
  stem: z.string(),
  branch: z.string(),
  stemElement: z.string(),
  branchElement: z.string(),
  stemYinYang: z.string(),
  naYin: z.string(),
  /** Ten god (十神) of this pillar's stem relative to the day master; null for the day pillar. */
  tenGod: z.string().nullable(),
  /**
   * Display-ready ten-god label so every host renders the same thing: the day
   * pillar is "日主(日元)" (the day master has no ten-god vs itself); other pillars
   * echo `tenGod`. Never null, so a model can never drop the day column.
   */
  tenGodDisplay: z.string(),
  hiddenStems: z.array(BaziHiddenStem),
  /** Branch zodiac (生肖); present for the year pillar. */
  zodiac: z.string().optional(),
});
export type BaziPillar = z.infer<typeof BaziPillar>;

/** One major luck cycle (大运). */
export const BaziMajorCycle = z.object({
  index: z.number().int(),
  startAge: z.number().int(),
  endAge: z.number().int(),
  startYear: z.number().int(),
  stem: z.string(),
  branch: z.string(),
  naYin: z.string(),
});
export type BaziMajorCycle = z.infer<typeof BaziMajorCycle>;

/** Luck-cycle start (起运) and the chain of major cycles (大运). */
export const BaziLuckCycle = z.object({
  forward: z.boolean(),
  startAfter: z.object({
    years: z.number().int(),
    months: z.number().int(),
    days: z.number().int(),
  }),
  startSolarDate: z.string(),
  majorCycles: z.array(BaziMajorCycle),
});
export type BaziLuckCycle = z.infer<typeof BaziLuckCycle>;

export const BaziChartResult = z.object({
  rulesetId: z.string(),
  provider: ProviderRef,
  /** Which local time base fed the pillars (civil, or mean/apparent solar). */
  solarTimeApplied: z.enum(['civil', 'mean', 'apparent']),
  /** Day-boundary / zi-hour convention actually applied. */
  dayBoundaryApplied: z.string(),
  dayMaster: z.object({
    stem: z.string(),
    element: z.string(),
    yinYang: z.string(),
  }),
  pillars: z.object({
    year: BaziPillar,
    month: BaziPillar,
    day: BaziPillar,
    /** Null when the birth time is unknown (no hour pillar). */
    hour: BaziPillar.nullable(),
  }),
  /** Null when gender is unspecified or the birth time is unknown. */
  luckCycle: BaziLuckCycle.nullable(),
});
export type BaziChartResult = z.infer<typeof BaziChartResult>;
