import type { WesternChartResult, WesternRuleFinding } from '@ming/contracts';

/**
 * Essential dignity rules. Reports when a planet is in domicile, exaltation, detriment or fall.
 * Source: Ptolemy, Tetrabiblos (public domain).
 */

const SRC = { text: 'Ptolemy, Tetrabiblos', chapter: 'Book I, essential dignities' };

const DIGNITY_MEANINGS: Record<string, string> = {
  domicile: '在本座，能量充分表达',
  exaltation: '在旺座，能量提升',
  detriment: '在弱势座，能量表达受限，需后天努力',
  fall: '在落陷座，能量发挥困难，需刻意经营',
};

export function dignityFindings(chart: WesternChartResult): WesternRuleFinding[] {
  const out: WesternRuleFinding[] = [];
  for (const planet of chart.planets) {
    if (!planet.dignity) continue;
    const meaning = DIGNITY_MEANINGS[planet.dignity];
    if (!meaning) continue;
    out.push({
      ruleId: `dignity/${planet.body.toLowerCase()}-${planet.dignity}`,
      topic: 'dignity',
      matched: true,
      claim: `${planet.body}处于${planet.dignity}状态：${meaning}`,
      source: SRC,
      reason: `${planet.body}在${planet.sign}为${planet.dignity}，古典占星认为此位置${meaning}`,
    });
  }
  return out;
}
