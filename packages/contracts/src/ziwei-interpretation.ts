import { z } from 'zod';
import { ProviderRef } from './provenance.ts';

/**
 * Zi Wei Dou Shu interpretation-rule results (P1a). Source-cited, deterministic
 * semantic rules for main-star meanings, palace-star combinations, sihua effects,
 * and brightness modifiers. Every finding names the classical source it derives from.
 */

/** A classical-text citation for Zi Wei Dou Shu. */
export const ZiweiRuleSource = z.object({
  /** Classical work, e.g. '紫微斗数全书' or '太微赋'. */
  text: z.string(),
  /** Section / chapter the rule derives from. */
  chapter: z.string(),
});
export type ZiweiRuleSource = z.infer<typeof ZiweiRuleSource>;

/** The interpretation topics covered by the Zi Wei rules package. */
export const ZiweiRuleTopic = z.enum(['main-star', 'palace-star', 'sihua', 'brightness']);
export type ZiweiRuleTopic = z.infer<typeof ZiweiRuleTopic>;

/** One sourced Zi Wei interpretation finding. */
export const ZiweiRuleFinding = z.object({
  /** Stable rule id within the ruleset (e.g. 'main-star/ziwei'). */
  ruleId: z.string(),
  topic: ZiweiRuleTopic,
  /** Whether the rule's precondition matched this chart. */
  matched: z.boolean(),
  /** The deterministic, sourced claim about meaning. */
  claim: z.string(),
  source: ZiweiRuleSource,
  /** Supporting reasoning derived from the chart's structured facts. */
  reason: z.string().optional(),
});
export type ZiweiRuleFinding = z.infer<typeof ZiweiRuleFinding>;

/** The full sourced Zi Wei interpretation for one chart. */
export const ZiweiInterpretation = z.object({
  rulesetId: z.string(),
  provider: ProviderRef,
  findings: z.array(ZiweiRuleFinding),
});
export type ZiweiInterpretation = z.infer<typeof ZiweiInterpretation>;
