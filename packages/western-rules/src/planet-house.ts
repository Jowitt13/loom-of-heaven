import type { WesternChartResult, WesternRuleFinding } from '@loom/contracts';

/**
 * Planet-house meaning rules. Sun and Moon in angular houses (1/4/7/10).
 * Source: Lilly, Christian Astrology (public domain).
 */

const SRC = { text: 'Lilly, Christian Astrology', chapter: 'Houses and their significations' };

const HOUSE_MEANINGS: Record<number, string> = {
  1: '与个人身份和自我表达直接相关',
  4: '与家庭、根基和内在安全感相关',
  7: '与一对一关系和合作相关',
  10: '与事业、社会地位和公众形象相关',
};

export function planetHouseFindings(chart: WesternChartResult): WesternRuleFinding[] {
  const out: WesternRuleFinding[] = [];
  for (const planet of chart.planets) {
    if (planet.body !== 'Sun' && planet.body !== 'Moon') continue;
    if (planet.house === null) continue;
    const meaning = HOUSE_MEANINGS[planet.house];
    if (!meaning) continue;
    out.push({
      ruleId: `planet-house/${planet.body.toLowerCase()}-h${planet.house}`,
      topic: 'planet-house',
      matched: true,
      claim: `${planet.body}在第${planet.house}宫：核心能量${meaning}`,
      source: SRC,
      reason: `${planet.body}落入第${planet.house}宫（角宫），该宫位主题被强化`,
    });
  }
  return out;
}
