import type { ProviderRef, ZiweiChartResult, ZiweiInterpretation } from '@ming/contracts';
import { mainStarFindings } from './main-star.ts';
import { palaceStarFindings } from './palace-star.ts';
import { sihuaFindings } from './sihua.ts';
import { brightnessFindings } from './brightness.ts';

/** Pinned rules-package version. */
export const ZIWEI_RULES_VERSION = '0.1.0';
export const ZIWEI_RULES_RULESET_ID = `ziwei-rules@${ZIWEI_RULES_VERSION}`;
const PROVIDER: ProviderRef = {
  id: 'ziwei-rules',
  version: ZIWEI_RULES_VERSION,
  license: 'MIT',
};

/**
 * Run the sourced Zi Wei interpretation rules over a computed chart. Pure,
 * deterministic, offline: reads the chart's structured facts and returns
 * source-cited findings. Never recomputes the chart.
 */
export function interpretZiwei(chart: ZiweiChartResult): ZiweiInterpretation {
  return {
    rulesetId: ZIWEI_RULES_RULESET_ID,
    provider: PROVIDER,
    findings: [
      ...mainStarFindings(chart),
      ...palaceStarFindings(chart),
      ...sihuaFindings(chart),
      ...brightnessFindings(chart),
    ],
  };
}
