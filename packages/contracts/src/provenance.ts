import { z } from 'zod';

/** A single upstream library used to compute part of a chart. */
export const ProviderRef = z.object({
  id: z.string(),
  version: z.string(),
  license: z.string(),
});
export type ProviderRef = z.infer<typeof ProviderRef>;

/** A versioned rule/school configuration applied to a system. */
export const RulesetRef = z.object({
  id: z.string(),
  version: z.string(),
});
export type RulesetRef = z.infer<typeof RulesetRef>;

/** Time-zone database identity so a result can be reproduced against the same data. */
export const TzdbRef = z.object({
  source: z.string(),
  version: z.string(),
});
export type TzdbRef = z.infer<typeof TzdbRef>;

/**
 * Everything needed to explain and reproduce a result: which libraries, which
 * rule sets, which TZDB, and which engine/schema version produced it.
 */
export const Provenance = z.object({
  engine: z.object({
    name: z.string(),
    version: z.string(),
    schemaVersion: z.string(),
  }),
  tzdb: TzdbRef,
  providers: z.array(ProviderRef),
  rulesets: z.array(RulesetRef),
});
export type Provenance = z.infer<typeof Provenance>;
