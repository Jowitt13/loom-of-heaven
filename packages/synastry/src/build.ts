import type { ChartBundle, SynastryFinding } from '@ming/contracts';
import { baziSynastryFindings } from './bazi-synastry.ts';
import { ziweiSynastryFindings } from './ziwei-synastry.ts';
import { westernSynastryFindings } from './western-synastry.ts';

/**
 * Aggregate the three-system 合婚 signals between two computed charts, prefixed with a
 * coarse overall tally. Pure and deterministic; the host narrates compatibility from
 * these facts with the reading-style discipline (no fated verdict). `focusYear` anchors
 * the BaZi 大运/流年共振应期 window (typically the current solar year).
 */
export function synastryFindings(
  a: ChartBundle,
  b: ChartBundle,
  focusYear: number,
): SynastryFinding[] {
  const findings: SynastryFinding[] = [
    ...baziSynastryFindings(a, b, focusYear),
    ...ziweiSynastryFindings(a, b),
    ...westernSynastryFindings(a, b),
  ];
  const ji = findings.filter((f) => f.polarity === '吉').length;
  const xiong = findings.filter((f) => f.polarity === '凶').length;
  const overall: SynastryFinding = {
    system: 'overall',
    code: 'overall/tally',
    claim: `综合信号：吉/合 ${ji} 项、张力/冲 ${xiong} 项、中性 ${findings.length - ji - xiong} 项`,
    polarity: ji > xiong ? '吉' : xiong > ji ? '凶' : '中性',
    reason:
      '按八字/紫微/占星三系合婚信号的吉凶计数所得的粗略倾向；契合与否是相处经营的结果而非命定，' +
      '张力多的组合亦可通过沟通与磨合改善，不作"注定在一起/必分手"的断言。',
    source: { text: '综合', chapter: '合婚汇总' },
  };
  return [overall, ...findings];
}
