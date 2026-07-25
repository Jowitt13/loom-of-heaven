import { z } from 'zod';
import { ProviderRef } from './provenance.ts';

/**
 * Western astrology interpretation-rule results (P1a). Source-cited, deterministic
 * semantic rules for planet-sign meanings, house placements, angles, aspects, and
 * dignity states. Every finding names the classical source it derives from.
 */

/** A classical-text citation for Western astrology. */
export const WesternRuleSource = z.object({
  /** Classical work, e.g. 'Ptolemy, Tetrabiblos' or 'Lilly, Christian Astrology'. */
  text: z.string(),
  /** Section / chapter the rule derives from. */
  chapter: z.string(),
});
export type WesternRuleSource = z.infer<typeof WesternRuleSource>;

/** The interpretation topics covered by the Western rules package. */
export const WesternRuleTopic = z.enum([
  'planet-sign',
  'planet-house',
  'angle',
  'aspect',
  'dignity',
]);
export type WesternRuleTopic = z.infer<typeof WesternRuleTopic>;

/** One sourced Western interpretation finding. */
export const WesternRuleFinding = z.object({
  /** Stable rule id within the ruleset (e.g. 'planet-sign/sun-aries'). */
  ruleId: z.string(),
  topic: WesternRuleTopic,
  /** Whether the rule's precondition matched this chart. */
  matched: z.boolean(),
  /** The deterministic, sourced claim about meaning. */
  claim: z.string(),
  source: WesternRuleSource,
  /** Supporting reasoning derived from the chart's structured facts. */
  reason: z.string().optional(),
});
export type WesternRuleFinding = z.infer<typeof WesternRuleFinding>;

/** The full sourced Western interpretation for one chart. */
export const WesternInterpretation = z.object({
  rulesetId: z.string(),
  provider: ProviderRef,
  findings: z.array(WesternRuleFinding),
});
export type WesternInterpretation = z.infer<typeof WesternInterpretation>;
