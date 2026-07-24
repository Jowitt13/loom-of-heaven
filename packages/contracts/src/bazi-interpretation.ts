import { z } from 'zod';
import { ProviderRef } from './provenance.ts';

/**
 * BaZi interpretation-rule results (handoff §5.2, §8). These are the deterministic,
 * SOURCE-CITED output of the rule layer — never an unsourced "single correct answer".
 * Each finding names the classic work + chapter it derives from. The layer reads only
 * the structured facts of a BaziChartResult (pillars, ten gods, hidden stems, luck
 * cycle); it never recomputes the chart and never fabricates a verdict.
 */

/** A public-domain classical-text citation. */
export const BaziRuleSource = z.object({
  /** Classic work, e.g. '子平真诠' or '滴天髓'. */
  text: z.string(),
  /** Chapter / section the rule derives from. */
  chapter: z.string(),
});
export type BaziRuleSource = z.infer<typeof BaziRuleSource>;

/** The interpretation topics covered by the rules package. */
export const BaziRuleTopic = z.enum([
  'strength',
  'pattern',
  'useful-god',
  'ten-gods',
  'relations',
  'shensha',
  'fortune',
]);
export type BaziRuleTopic = z.infer<typeof BaziRuleTopic>;

/** Auspiciousness polarity for a fortune-oriented finding. */
export const BaziPolarity = z.enum(['吉', '凶', '中性']);
export type BaziPolarity = z.infer<typeof BaziPolarity>;

/** One sourced interpretation finding. */
export const BaziRuleFinding = z.object({
  /** Stable rule id within the ruleset (e.g. 'strength/de-ling'). */
  ruleId: z.string(),
  topic: BaziRuleTopic,
  /** Whether the rule's precondition matched this chart. */
  matched: z.boolean(),
  /** The deterministic, sourced determination. */
  claim: z.string(),
  /** Auspiciousness leaning for fortune/relations/shensha findings (吉/凶/中性). */
  polarity: BaziPolarity.optional(),
  source: BaziRuleSource,
  /** Supporting reasoning derived from the chart's structured facts. */
  detail: z.string().optional(),
  /**
   * The causal chain a reading should state BEFORE its conclusion, e.g.
   * "身强、印比偏重、正财两透且财星有根 → 喜水木行财官、需金疏土生财".
   */
  reason: z.string().optional(),
});
export type BaziRuleFinding = z.infer<typeof BaziRuleFinding>;

/** The full sourced BaZi interpretation for one chart. */
export const BaziInterpretation = z.object({
  rulesetId: z.string(),
  provider: ProviderRef,
  findings: z.array(BaziRuleFinding),
});
export type BaziInterpretation = z.infer<typeof BaziInterpretation>;
