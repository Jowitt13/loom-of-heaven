import { EngineError, ERROR_CODES } from './errors.ts';
import {
  BAZI_RULESET_CURRENT,
  WESTERN_RULESET_CURRENT,
  WESTERN_RULESET_RETIRED,
  ZIWEI_RULESET_CURRENT,
} from './birth-input.ts';
import { VEDIC_RULESET_CURRENT } from './vedic.ts';

export type RulesetSystem = 'western' | 'bazi' | 'ziwei' | 'vedic';

/** Actual implemented versions; this table is the only executable set. */
const CURRENT_RULESETS: Readonly<Record<RulesetSystem, string>> = {
  western: WESTERN_RULESET_CURRENT,
  bazi: BAZI_RULESET_CURRENT,
  ziwei: ZIWEI_RULESET_CURRENT,
  vedic: VEDIC_RULESET_CURRENT,
};

/** Retired ids are rejection/diagnosis inputs only, never executable. */
const RETIRED_RULESETS: Readonly<Record<RulesetSystem, readonly string[]>> = {
  western: WESTERN_RULESET_RETIRED,
  bazi: [],
  ziwei: [],
  vedic: [],
};

export function assertSupportedRuleset(system: RulesetSystem, requested: string): void {
  const current = CURRENT_RULESETS[system];
  if (requested === current) return;
  if (RETIRED_RULESETS[system].includes(requested)) {
    throw new EngineError(
      ERROR_CODES.RULESET_UNSUPPORTED,
      `Ruleset "${requested}" has been retired. Use ${current}.`,
      { requestedRuleset: requested, currentRuleset: current },
    );
  }
  throw new EngineError(
    ERROR_CODES.RULESET_UNSUPPORTED,
    `Ruleset "${requested}" is not implemented for ${system}. Use ${current}.`,
    { requestedRuleset: requested, currentRuleset: current },
  );
}
