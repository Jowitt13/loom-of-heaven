import { ENGINE_NAME, ENGINE_VERSION, SCHEMA_VERSION } from '@loom/contracts';
import type { NormalizedBirthData, Provenance, ProviderRef, RulesetRef } from '@loom/contracts';

/**
 * Verified upstream provider metadata (license/version audit). `status` reflects
 * integration: all three chart systems are wired — Western via astronomy-engine
 * (celestine was evaluated and rejected at the ADR 0003 ≤1′ gate), BaZi via tyme4ts,
 * Zi Wei via iztro.
 */
export const PROVIDER_REGISTRY = [
  {
    system: 'western',
    id: 'astronomy-engine',
    version: '^2.1.19',
    license: 'MIT',
    status: 'ready',
  },
  { system: 'bazi', id: 'tyme4ts', version: '^1.5.2', license: 'MIT', status: 'ready' },
  { system: 'ziwei', id: 'iztro', version: '^2.5.8', license: 'MIT', status: 'ready' },
] as const;

/** Split a `name@version` ruleset id into a structured RulesetRef. */
export function parseRulesetId(rulesetId: string): RulesetRef {
  const at = rulesetId.lastIndexOf('@');
  if (at <= 0) return { id: rulesetId, version: '0.0.0' };
  return { id: rulesetId.slice(0, at), version: rulesetId.slice(at + 1) };
}

/**
 * Build provenance reflecting what actually ran: the engine identity, the bundled
 * TZDB, and the providers/rulesets that produced results this call.
 */
export function buildProvenance(
  normalized: NormalizedBirthData,
  providers: ProviderRef[],
  rulesets: RulesetRef[],
): Provenance {
  return {
    engine: { name: ENGINE_NAME, version: ENGINE_VERSION, schemaVersion: SCHEMA_VERSION },
    tzdb: normalized.tzdb,
    providers: dedupe(providers, (p) => `${p.id}@${p.version}`),
    rulesets: dedupe(rulesets, (r) => `${r.id}@${r.version}`),
  };
}

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}
