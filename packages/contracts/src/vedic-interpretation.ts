import { z } from 'zod';
import { ProviderRef } from './provenance.ts';

/** A public-domain source used by the deliberately bounded Vedic rule layer. */
export const VedicRuleSource = z.strictObject({
  text: z.string(),
  chapter: z.string(),
});
export type VedicRuleSource = z.infer<typeof VedicRuleSource>;

/** Structural rule families implemented in ADR 0013 P4. */
export const VedicRuleTopic = z.enum(['nakshatra', 'bhava', 'panchanga', 'vimshottari']);
export type VedicRuleTopic = z.infer<typeof VedicRuleTopic>;

/**
 * A sourced structural finding. P4 intentionally emits no deterministic fate
 * verdicts: a finding states only a computed chart relationship plus its source.
 */
export const VedicRuleFinding = z.strictObject({
  ruleId: z.string(),
  topic: VedicRuleTopic,
  matched: z.boolean(),
  claim: z.string(),
  source: VedicRuleSource,
  reason: z.string().optional(),
  caveat: z.string().optional(),
});
export type VedicRuleFinding = z.infer<typeof VedicRuleFinding>;

/** Full sourced Vedic rule output for one computed chart. */
export const VedicInterpretation = z.strictObject({
  rulesetId: z.string(),
  provider: ProviderRef,
  findings: z.array(VedicRuleFinding),
});
export type VedicInterpretation = z.infer<typeof VedicInterpretation>;
