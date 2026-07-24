import type {
  BaziChartResult,
  BaziInterpretation,
  BaziRuleFinding,
  ProviderRef,
} from '@ming/contracts';
import { strengthFinding } from './strength.ts';
import { patternFinding } from './pattern.ts';
import { usefulGodFinding } from './useful-god.ts';
import { tenGodsFinding } from './ten-gods.ts';
import { relationFindings, stemCombinationFindings } from './relations.ts';
import { shenshaFindings } from './shensha.ts';
import { luckCycleFortuneFindings, luckClashFindings, annualTimelineFindings } from './fortune.ts';

/** Pinned rules-package version (mirrors this package's version). */
export const BAZI_RULES_VERSION = '0.1.0';
/** The versioned ruleset id recorded on every interpretation. */
export const BAZI_RULES_RULESET_ID = `bazi-rules-ziping@${BAZI_RULES_VERSION}`;
const PROVIDER: ProviderRef = { id: 'bazi-rules', version: BAZI_RULES_VERSION, license: 'MIT' };

/**
 * Run the sourced BaZi interpretation rules over a computed chart. Pure, deterministic,
 * offline: it only reads the chart's structured facts and returns source-cited findings
 * (旺衰 / 格局 / 喜用神 / 十神象义 / 刑冲合害 / 神煞 / 大运吉凶). It never recomputes the
 * chart. Fortune-oriented findings carry a `polarity` (吉/凶/中性) and a `reason`; the host
 * LLM turns them into a "先结论→原因→概率→年份" reading (probabilities/years are the model's
 * judgment, not engine output), keeping the traditional-culture / non-scientific disclaimer.
 */
export function interpretBazi(
  bazi: BaziChartResult,
  opts: { focusYear?: number } = {},
): BaziInterpretation {
  const findings: BaziRuleFinding[] = [
    strengthFinding(bazi),
    patternFinding(bazi),
    usefulGodFinding(bazi),
    tenGodsFinding(bazi),
    ...relationFindings(bazi),
    ...stemCombinationFindings(bazi),
    ...shenshaFindings(bazi),
    ...luckCycleFortuneFindings(bazi),
    ...luckClashFindings(bazi),
    ...(opts.focusYear !== undefined ? annualTimelineFindings(bazi, opts.focusYear) : []),
  ];
  return { rulesetId: BAZI_RULES_RULESET_ID, provider: PROVIDER, findings };
}
