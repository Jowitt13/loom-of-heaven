import { canonicalJson } from '@ming/contracts';
import type { BirthInput, ChartBundle } from '@ming/contracts';
import { calculate } from './calculate.ts';
import type { CalculateOptions } from './calculate.ts';

/**
 * Named ruleset profiles (handoff §5). Each is a pure override applied over the
 * base input's settings, so a user can compare "what changes if I switch school /
 * solar-time strategy / house system". Profiles never change the input identity,
 * only versioned settings.
 */
export const COMPARE_PROFILES: Record<string, (input: BirthInput) => BirthInput> = {
  default: (input) => input,
  'apparent-solar': (input) => ({
    ...input,
    settings: {
      ...input.settings,
      bazi: { ...input.settings.bazi, solarTimeMode: 'apparent' },
      ziwei: { ...input.settings.ziwei, useApparentSolarTime: true },
    },
  }),
  'mean-solar': (input) => ({
    ...input,
    settings: { ...input.settings, bazi: { ...input.settings.bazi, solarTimeMode: 'mean' } },
  }),
  'whole-sign': (input) => ({
    ...input,
    settings: {
      ...input.settings,
      western: { ...input.settings.western, houseSystem: 'whole-sign' },
    },
  }),
};

export function listCompareProfiles(): string[] {
  return Object.keys(COMPARE_PROFILES);
}

export interface CompareEntry {
  profile: string;
  bundle: ChartBundle;
}

export interface CompareResult {
  ok: true;
  profiles: CompareEntry[];
  /** True when every profile produced identical normalized time. */
  normalizedTimeIdentical: boolean;
  notes: string[];
}

/**
 * Compare the base input under several profiles (CLI `compare`). In this engine
 * version normalization (the UTC instant) is invariant to these rule settings,
 * so the comparison confirms that and notes that system-level differences arrive
 * with the Phase 2 providers — an honest result, not a fabricated divergence.
 */
export function compareProfiles(
  input: BirthInput,
  profileIds: string[],
  options: CalculateOptions = {},
): CompareResult {
  const unknown = profileIds.filter((id) => !(id in COMPARE_PROFILES));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown compare profile(s): ${unknown.join(', ')}. Available: ${listCompareProfiles().join(', ')}`,
    );
  }

  const profiles: CompareEntry[] = profileIds.map((profile) => ({
    profile,
    bundle: calculate(COMPARE_PROFILES[profile]!(input), options),
  }));

  const normalizedCanonicals = new Set(
    profiles.map((entry) => canonicalJson(entry.bundle.normalizedTime)),
  );
  const normalizedTimeIdentical = normalizedCanonicals.size === 1;

  const notes: string[] = [];
  if (normalizedTimeIdentical) {
    notes.push(
      'Normalized time (UTC instant, offset, solar time) is identical across these profiles; these rulesets affect chart computation, which arrives in Phase 2.',
    );
  } else {
    notes.push('Normalized time differs across profiles — see each bundle.normalizedTime.');
  }

  return { ok: true, profiles, normalizedTimeIdentical, notes };
}
