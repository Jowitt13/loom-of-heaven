import type { ProviderRef, WesternChartResult, WesternInterpretation } from '@loom/contracts';
import { planetSignFindings } from './planet-sign.ts';
import { planetHouseFindings } from './planet-house.ts';
import { angleFindings } from './angles.ts';
import { aspectFindings } from './aspects.ts';
import { dignityFindings } from './dignity.ts';

/** Pinned rules-package version. */
export const WESTERN_RULES_VERSION = '0.1.0';
export const WESTERN_RULES_RULESET_ID = `western-rules@${WESTERN_RULES_VERSION}`;
const PROVIDER: ProviderRef = {
  id: 'western-rules',
  version: WESTERN_RULES_VERSION,
  license: 'MIT',
};

/**
 * Run the sourced Western interpretation rules over a computed chart. Pure,
 * deterministic, offline: reads the chart's structured facts and returns
 * source-cited findings. Never recomputes the chart.
 */
export function interpretWestern(chart: WesternChartResult): WesternInterpretation {
  return {
    rulesetId: WESTERN_RULES_RULESET_ID,
    provider: PROVIDER,
    findings: [
      ...planetSignFindings(chart),
      ...planetHouseFindings(chart),
      ...angleFindings(chart),
      ...aspectFindings(chart),
      ...dignityFindings(chart),
    ],
  };
}
